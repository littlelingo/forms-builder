/**
 * Walkthrough route E2E — hosted-user-style preview happy path.
 *
 * Mocks the API to serve the checkbox→radio fixture project (shared with
 * the TestPanel suite), enters the Walkthrough route from the builder
 * toolbar, advances through the only step via the Submit button, and
 * asserts that the mock host bridge surfaces the submit toast.
 *
 * Why this matters: locks the route's engine mount, form.submit
 * subscription, toast render, and exit affordance against regressions.
 *
 * Usage:
 *   node apps/web/e2e/walkthrough.run.mjs   # requires E2E_BASE_URL env var
 *   npm run e2e:walkthrough                 # via orchestrator (recommended)
 */

import { chromium } from "playwright";

import {
  buildCheckboxToRadioProjectDetail,
  buildCheckboxToRadioProjectRecord,
  FIXTURE_TEST_PANEL_PROJECT_ID,
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
  const detail = buildCheckboxToRadioProjectDetail();
  const projectRecord = buildCheckboxToRadioProjectRecord();

  await page.route(new RegExp(`^${API_HOST}/`), (route) => {
    const url = route.request().url();
    console.warn(`[e2e] unmocked API call: ${url}`);
    return route.fulfill(jsonResponse({ detail: "unmocked" }, 404));
  });

  await page.route(`${API_HOST}/conversions`, (route) => route.fulfill(jsonResponse([])));
  await page.route(`${API_HOST}/sample-pdfs`, (route) => route.fulfill(jsonResponse([])));
  await page.route(`${API_HOST}/projects`, (route) => route.fulfill(jsonResponse([projectRecord])));
  await page.route(new RegExp(`^${API_HOST}/projects/${FIXTURE_TEST_PANEL_PROJECT_ID}$`), (route) =>
    route.fulfill(jsonResponse(detail)),
  );
  await page.route(new RegExp(`^${API_HOST}/projects/${FIXTURE_TEST_PANEL_PROJECT_ID}/document$`), (route) =>
    route.fulfill(jsonResponse(detail.document)),
  );
  await page.route(new RegExp(`^${API_HOST}/projects/${FIXTURE_TEST_PANEL_PROJECT_ID}/source-context$`), (route) =>
    route.fulfill(jsonResponse(detail.sourceContext)),
  );
  await page.route(new RegExp(`^${API_HOST}/projects/${FIXTURE_TEST_PANEL_PROJECT_ID}/revisions$`), (route) =>
    route.fulfill(jsonResponse([])),
  );
  await page.route(new RegExp(`^${API_HOST}/projects/${FIXTURE_TEST_PANEL_PROJECT_ID}/library$`), (route) =>
    route.fulfill(jsonResponse([])),
  );
  await page.route(new RegExp(`^${API_HOST}/projects/${FIXTURE_TEST_PANEL_PROJECT_ID}/project-events$`), (route) =>
    route.fulfill(jsonResponse({ version: "1.0", projectEvents: [] })),
  );
}

async function openProject(page, projectName) {
  const button = page.getByRole("button", { name: new RegExp(projectName, "i") }).first();
  await button.waitFor({ timeout: 5_000 });
  await button.click();
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
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
    await openProject(page, "Checkbox to Radio E2E");

    // Wait for builder workspace toolbar (which carries the Walkthrough entry).
    const builderToolbar = page.getByRole("toolbar", { name: /Builder stage toolbar/i });
    await builderToolbar.waitFor({ timeout: 5_000 });

    console.log("[e2e] entering Walkthrough route");
    await builderToolbar.getByRole("button", { name: /Walkthrough/i }).click();

    // WalkthroughHeader renders inside a role=banner with "Step N of M" text.
    console.log("[e2e] asserting walkthrough header visible");
    const walkthroughBanner = page.getByRole("banner");
    await walkthroughBanner.waitFor({ timeout: 5_000 });
    // The header (banner) renders "Step 1 of 1 — Personal Info"; the
    // navigation footer renders just "Step 1 of 1". Match the header copy
    // unambiguously to confirm the route mounted.
    await walkthroughBanner.getByText(/Step\s+1\s+of\s+1/i).waitFor({ timeout: 5_000 });

    // The fixture has a single step; the primary CTA reads "Submit".
    console.log("[e2e] clicking Submit");
    const navigation = page.getByRole("navigation", { name: /Walkthrough navigation/i });
    await navigation.getByRole("button", { name: /^Submit$/i }).click();

    // The mock host bridge emits `Form submit received at <iso-timestamp>` in
    // a role=status toast.
    console.log("[e2e] asserting submit toast");
    const toast = page.getByRole("status");
    await toast.waitFor({ timeout: 5_000 });
    await toast.getByText(/Form submit received/i).waitFor({ timeout: 5_000 });

    // Exit walkthrough returns to the builder workspace.
    console.log("[e2e] exiting walkthrough");
    await walkthroughBanner.getByRole("button", { name: /Exit walkthrough/i }).click();
    // Builder toolbar reappears after exit.
    await page.getByRole("toolbar", { name: /Builder stage toolbar/i }).waitFor({ timeout: 5_000 });

    console.log("\nWalkthrough E2E PASSED.");
  } catch (error) {
    console.error("\nWalkthrough E2E FAILED:");
    console.error(error.message);
    if (error.stack) console.error(error.stack.split("\n").slice(0, 4).join("\n"));
    try {
      const shotPath = new URL("./failure-walkthrough.png", import.meta.url).pathname;
      await page.screenshot({ path: shotPath, fullPage: true });
      console.error(`[e2e] failure screenshot: ${shotPath}`);
      const visibleText = await page.evaluate(() => document.body.innerText.slice(0, 2000));
      console.error("[e2e] visible body text (first 2000 chars):");
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
