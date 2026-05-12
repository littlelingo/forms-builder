/**
 * Orchestrator for Playwright-based E2E suites.
 *
 * Mirrors tools/a11y-smoke/orchestrate.mjs: boots `vite preview` on a free
 * port, waits for it, runs the supplied run script against it, tears the
 * preview down.
 *
 * Usage (via npm script):
 *   npm run e2e:phase3         # uses default ./run.mjs
 *   npm run e2e:test-panel     # uses ./test-panel.run.mjs
 *   npm run e2e:walkthrough    # uses ./walkthrough.run.mjs
 *
 * Direct invocation:
 *   node apps/web/e2e/orchestrate.mjs                       # default run.mjs
 *   node apps/web/e2e/orchestrate.mjs ./other.run.mjs
 *
 * The run-script argument is resolved relative to this file, must be a path
 * (default `./run.mjs`), and is forked as a child process so each suite
 * runs in an isolated Node process. The orchestrator boots a preview server,
 * sets E2E_BASE_URL in the child env, and exits with the child's exit code.
 *
 * Assumes the web app is already built (dist/ exists). The npm script
 * runs `build:web` first.
 *
 * The E2E uses Playwright route mocking — no live API required.
 */

import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const RUN_SCRIPT = process.argv[2] ?? "./run.mjs";
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

function runScan(baseUrl, runScript) {
  return new Promise((resolve) => {
    const child = spawn("node", [new URL(runScript, import.meta.url).pathname], {
      stdio: "inherit",
      env: { ...process.env, E2E_BASE_URL: baseUrl },
    });
    child.on("close", resolve);
  });
}

async function main() {
  console.log(`Starting vite preview on port ${PREVIEW_PORT}… (run script: ${RUN_SCRIPT})`);
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
    scanExit = await runScan(BASE_URL, RUN_SCRIPT);
  } finally {
    server.kill("SIGTERM");
  }

  process.exit(scanExit ?? 0);
}

main().catch((err) => {
  console.error("Orchestrator crashed:", err);
  process.exit(2);
});
