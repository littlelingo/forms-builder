/**
 * TestPanel E2E — author-side synth-fire round trip.
 *
 * Mocks the API to serve a project whose document contains a checkbox field
 * with a listener that fires on `field.change` and marks a sibling radio
 * field as required. The test:
 *
 *   1. opens the fixture project (lands directly in the builder workspace),
 *   2. opens the unified TestPanel via Cmd/Ctrl+K,
 *   3. picks the checkbox source via the SourcePicker's type-ahead,
 *   4. fires `field.change` from the panel's "Fire event" button,
 *   5. asserts the trace shows the listener ran and reports the
 *      `mark_required` action.
 *
 * Why this matters: locks the synth-mode happy path through the panel's
 * source selection, event-type fallback, payload form, and trace render.
 *
 * Usage:
 *   node apps/web/e2e/test-panel.run.mjs   # requires E2E_BASE_URL env var
 *   npm run e2e:test-panel                 # via orchestrator (recommended)
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

    // Wait for builder workspace to settle — toolbar carries the Test trigger.
    const builderToolbar = page.getByRole("toolbar", { name: /Builder stage toolbar/i });
    await builderToolbar.waitFor({ timeout: 5_000 });

    // Select the checkbox field on the canvas FIRST so that openTestPanel's
    // selection-derivation picks it up. The panel mirrors authoring
    // selection while open, so opening the panel without a pre-selected
    // field would default to the active step (and immediately reset any
    // user-chosen source via the mirror effect). Clicking the field card's
    // label is the most realistic and stable way to set this state.
    console.log("[e2e] selecting checkbox field on canvas");
    await page.getByText("Type of benefit(s) applying for").first().click();

    console.log("[e2e] opening TestPanel via Cmd+K");
    await page.keyboard.press("Meta+K");

    const panel = page.locator('[role="dialog"][aria-label="Test panel"]');
    await panel.waitFor({ timeout: 5_000 });

    // SourcePicker chips reflect the active source. With the checkbox
    // pre-selected, the breadcrumb should include "Checkbox group".
    await panel.getByText("Checkbox group", { exact: true }).first().waitFor({ timeout: 5_000 });

    // Event select should default to field.change (draft); leave as-is.
    // Set the nextValue payload field so the trace reflects a meaningful value.
    console.log("[e2e] setting payload nextValue=Disability");
    const nextValueInput = panel.locator('input[id$="-payload-nextValue"]');
    await nextValueInput.waitFor({ timeout: 5_000 });
    await nextValueInput.fill("Disability");

    console.log("[e2e] firing event");
    const fireButton = panel.getByRole("button", { name: /Fire event/i });
    await fireButton.waitFor({ timeout: 5_000 });
    await fireButton.click();

    // Assert listener trace: a "Listener ran" row appears and the action row
    // mentions mark_required + the executed status.
    console.log("[e2e] asserting listener trace");
    await panel.getByText(/Listener ran/i).waitFor({ timeout: 5_000 });
    await panel.getByText(/mark_required/i).waitFor({ timeout: 5_000 });
    await panel
      .getByText(/executed/i)
      .first()
      .waitFor({ timeout: 5_000 });

    console.log("\nTestPanel E2E PASSED.");
  } catch (error) {
    console.error("\nTestPanel E2E FAILED:");
    console.error(error.message);
    if (error.stack) console.error(error.stack.split("\n").slice(0, 4).join("\n"));
    try {
      const shotPath = new URL("./failure-test-panel.png", import.meta.url).pathname;
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
