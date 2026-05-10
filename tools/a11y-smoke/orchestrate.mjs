/**
 * Orchestrator for the a11y smoke test.
 *
 * Starts `vite preview` on a free port, waits for it to be ready,
 * runs run.mjs, then tears down the preview server regardless of outcome.
 *
 * Usage (via npm script):
 *   npm run a11y:smoke
 *
 * This script assumes the web app is already built (dist/ exists).
 * Run `npm run build:web` first if needed.
 */

import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const PREVIEW_PORT = process.env.A11Y_SMOKE_PORT ?? "4173";
const BASE_URL = `http://localhost:${PREVIEW_PORT}`;
const MAX_WAIT_MS = 15_000;
const POLL_INTERVAL_MS = 500;

/** Spawn `vite preview` and return the child process. */
function startPreview(port) {
  return spawn("npx", ["vite", "preview", "--port", String(port), "--strictPort"], {
    cwd: new URL("../../apps/web", import.meta.url).pathname,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env },
  });
}

/** Poll until the preview server responds or timeout elapses. */
async function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.ok || res.status < 500) return true;
    } catch {
      // Not ready yet — keep polling.
    }
    await delay(POLL_INTERVAL_MS);
  }
  return false;
}

/** Run the axe scan as a child process; resolve with its exit code. */
function runScan(baseUrl) {
  return new Promise((resolve) => {
    const child = spawn("node", [new URL("run.mjs", import.meta.url).pathname], {
      stdio: "inherit",
      env: { ...process.env, A11Y_SMOKE_URL: baseUrl },
    });
    child.on("close", resolve);
  });
}

async function main() {
  console.log(`Starting vite preview on port ${PREVIEW_PORT}…`);
  const server = startPreview(PREVIEW_PORT);

  let serverOut = "";
  server.stdout.on("data", (d) => {
    serverOut += d.toString();
  });
  server.stderr.on("data", (d) => {
    serverOut += d.toString();
  });

  const ready = await waitForServer(BASE_URL, MAX_WAIT_MS);
  if (!ready) {
    console.error("Preview server did not start in time.");
    console.error("Server output:\n", serverOut);
    server.kill();
    process.exit(2);
  }

  console.log(`Preview server ready at ${BASE_URL}\n`);

  let scanExit = 0;
  try {
    scanExit = await runScan(BASE_URL);
  } finally {
    server.kill("SIGTERM");
  }

  process.exit(scanExit ?? 0);
}

main().catch((err) => {
  console.error("Orchestrator crashed:", err);
  process.exit(2);
});
