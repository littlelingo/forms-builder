/**
 * Orchestrator for the Phase 3 composer E2E.
 *
 * Mirrors tools/a11y-smoke/orchestrate.mjs: boots `vite preview` on a free
 * port, waits for it, runs run.mjs against it, tears the preview down.
 *
 * Usage (via npm script):
 *   npm run e2e:phase3
 *
 * Assumes the web app is already built (dist/ exists). The npm script
 * runs `build:web` first.
 *
 * The E2E uses Playwright route mocking — no live API required.
 */

import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const PREVIEW_PORT = process.env.E2E_PREVIEW_PORT ?? "4174";
const BASE_URL = `http://localhost:${PREVIEW_PORT}`;
const MAX_WAIT_MS = 15_000;
const POLL_INTERVAL_MS = 500;

function startPreview(port) {
  return spawn("npx", ["vite", "preview", "--port", String(port), "--strictPort"], {
    cwd: new URL("../", import.meta.url).pathname,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env },
  });
}

async function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.ok || res.status < 500) return true;
    } catch {
      // not ready yet
    }
    await delay(POLL_INTERVAL_MS);
  }
  return false;
}

function runScan(baseUrl) {
  return new Promise((resolve) => {
    const child = spawn("node", [new URL("run.mjs", import.meta.url).pathname], {
      stdio: "inherit",
      env: { ...process.env, E2E_BASE_URL: baseUrl },
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
