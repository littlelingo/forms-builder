/**
 * Phase 3 composer E2E — author-side round-trip for async action kinds.
 *
 * Boots a Playwright chromium against the built web app, mocks the API to
 * serve a project whose listener already contains a `host_call_await`
 * action, then verifies:
 *
 *   1. the project loads into the builder workspace,
 *   2. the inspector behavior stack lists the seeded listener,
 *   3. the listener row reflects the seeded action count (1 action) — i.e.
 *      the wire contract preserved the async action kind across read.
 *
 * Why this matters: composing async chains via the inline composer is a
 * Phase 3 surface; this spec locks the read path so a future regression in
 * either the runtime helpers or App.tsx state hydration trips here first.
 *
 * Usage:
 *   node apps/web/e2e/run.mjs            # requires E2E_BASE_URL env var
 *   npm run e2e:phase3                   # via orchestrator (recommended)
 */

import { chromium } from "playwright";

import {
  buildProjectDetail,
  buildProjectRecord,
  FIXTURE_PROJECT_ID,
} from "./fixtures.mjs";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:4174";
const API_HOST = "http://127.0.0.1:8000";

function jsonResponse(body, status = 200) {
  return {
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  };
}

async function installApiMocks(page) {
  const detail = buildProjectDetail();
  const projectRecord = buildProjectRecord();

  // Playwright matches routes in reverse order of registration — the most
  // recently added route wins. Register the catch-all first so specific
  // routes override it.
  await page.route(new RegExp(`^${API_HOST}/`), (route) => {
    const url = route.request().url();
    console.warn(`[e2e] unmocked API call: ${url}`);
    return route.fulfill(jsonResponse({ detail: "unmocked" }, 404));
  });

  await page.route(`${API_HOST}/conversions`, (route) =>
    route.fulfill(jsonResponse([])),
  );

  await page.route(`${API_HOST}/sample-pdfs`, (route) =>
    route.fulfill(jsonResponse([])),
  );

  await page.route(`${API_HOST}/projects`, (route) =>
    route.fulfill(jsonResponse([projectRecord])),
  );

  await page.route(
    new RegExp(`^${API_HOST}/projects/${FIXTURE_PROJECT_ID}$`),
    (route) => route.fulfill(jsonResponse(detail)),
  );

  await page.route(
    new RegExp(`^${API_HOST}/projects/${FIXTURE_PROJECT_ID}/document$`),
    (route) => route.fulfill(jsonResponse(detail.document)),
  );

  await page.route(
    new RegExp(`^${API_HOST}/projects/${FIXTURE_PROJECT_ID}/source-context$`),
    (route) => route.fulfill(jsonResponse(detail.sourceContext)),
  );

  await page.route(
    new RegExp(`^${API_HOST}/projects/${FIXTURE_PROJECT_ID}/revisions$`),
    (route) => route.fulfill(jsonResponse([])),
  );

  await page.route(
    new RegExp(`^${API_HOST}/projects/${FIXTURE_PROJECT_ID}/library$`),
    (route) => route.fulfill(jsonResponse([])),
  );

  await page.route(
    new RegExp(`^${API_HOST}/projects/${FIXTURE_PROJECT_ID}/project-events$`),
    (route) => route.fulfill(jsonResponse({ version: "1.0", projectEvents: [] })),
  );
}

async function openProject(page, projectName) {
  const button = page.getByRole("button", { name: new RegExp(projectName, "i") }).first();
  await button.waitFor({ timeout: 5_000 });
  await button.click();
}

async function assertListenerVisible(page) {
  const stack = page.getByRole("region", { name: "Behavior stack" });
  await stack.waitFor({ timeout: 5_000 });
  // Stack header reads "Behaviors · N" — one seeded listener means N=1.
  const header = stack.getByText(/Behaviors\s*·\s*1/i).first();
  await header.waitFor({ timeout: 5_000 });
}

async function assertHostCallAwaitRendered(page) {
  // The listener row's summary surfaces the seeded action kind as
  // humanised "host call await" — proves the wire contract preserved the
  // async action kind across the GET round-trip.
  const stack = page.getByRole("region", { name: "Behavior stack" });
  const summary = stack.getByText(/host call await/i).first();
  await summary.waitFor({ timeout: 5_000 });
  // Trigger pill summarises the eventName — "submit" derived from form.submit.
  const trigger = stack.getByText(/^submit$/i).first();
  await trigger.waitFor({ timeout: 5_000 });
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();

  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning") {
      console.log(`[browser:${msg.type()}] ${msg.text()}`);
    }
  });
  page.on("pageerror", (err) => {
    console.log(`[browser:pageerror] ${err.message}`);
    if (err.stack) console.log(err.stack);
  });

  let exitCode = 0;
  try {
    await installApiMocks(page);

    console.log(`[e2e] navigating to ${BASE_URL}`);
    await page.goto(BASE_URL, { waitUntil: "networkidle" });

    console.log("[e2e] opening fixture project");
    await openProject(page, "Phase 3 composer E2E");

    console.log("[e2e] switching to Behavior tab");
    const behaviorTab = page.getByRole("button", { name: "Behavior", exact: true });
    await behaviorTab.click();

    console.log("[e2e] asserting seeded listener visible");
    await assertListenerVisible(page);

    console.log("[e2e] asserting host_call_await action kind surfaces in stack row");
    await assertHostCallAwaitRendered(page);

    console.log("\nPhase 3 composer E2E PASSED.");
  } catch (error) {
    console.error("\nPhase 3 composer E2E FAILED:");
    console.error(error.message);
    if (error.stack) console.error(error.stack.split("\n").slice(0, 4).join("\n"));
    try {
      const shotPath = new URL("./failure.png", import.meta.url).pathname;
      await page.screenshot({ path: shotPath, fullPage: true });
      console.error(`[e2e] failure screenshot: ${shotPath}`);
      const visibleText = await page.evaluate(() => document.body.innerText.slice(0, 1500));
      console.error("[e2e] visible body text (first 1500 chars):");
      console.error(visibleText);
    } catch (shotErr) {
      console.error("[e2e] could not capture failure artefacts:", shotErr.message);
    }
    exitCode = 1;
  } finally {
    await browser.close();
  }

  process.exit(exitCode);
}

main().catch((err) => {
  console.error("[e2e] crashed:", err);
  process.exit(2);
});
