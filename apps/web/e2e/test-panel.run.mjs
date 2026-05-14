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

    // === Session tab flow ===
    // Exercises the Session-tab fold of the legacy BehaviorWorkspace simulator:
    // lifecycle controls (Reset, Fill required, Submit), the always-visible
    // status strip's submit pill, the host-loop simulate buttons, and the
    // trace History view that surfaces recordedReports.

    console.log("[e2e] switching to Session tab");
    await panel.getByRole("button", { name: /^Session$/i }).click();

    // Wait for Session body to render — Lifecycle heading is a stable anchor.
    await panel.getByText(/Lifecycle/i).waitFor({ timeout: 3_000 });

    // Reset first. The synth-mode field.change above made the radio
    // runtime-required via the mark_required listener. We want a clean session
    // so Submit can reach 'submitting' instead of failing validation.
    console.log("[e2e] clicking Reset (clears runtime state)");
    await panel.getByRole("button", { name: /^Reset$/i }).click();

    // Fill required is a no-op here (no statically required fields in this
    // fixture) but exercising the click path catches regressions in wiring.
    console.log("[e2e] clicking Fill required");
    await panel.getByRole("button", { name: /Fill required/i }).click();

    console.log("[e2e] clicking Submit");
    await panel.getByRole("button", { name: /^Submit$/i }).click();

    // Status strip lives inside the panel — scope to avoid colliding with any
    // other "Submit:" text the page might surface. The strip shows
    // "Submit: <status>". After Reset+Submit the engine emits form.submit
    // and parks at 'submitting' (no auto host_success listener in fixture and
    // the shared mock-host bridge auto-responds only to host.action_requested,
    // not to form.submit).
    console.log("[e2e] waiting for submit pill to flip");
    const submitPill = panel.locator("text=/Submit:\\s*(submitting|success)/i").first();
    await submitPill.waitFor({ timeout: 5_000 });

    // Note: previously this script clicked "Simulate success" / "Simulate error"
    // buttons rendered inline in the Session tab. Phase 7 of the mock-host-bridge
    // plan removed those buttons in favor of the dedicated Host tab below.

    // Switch trace toggle to History. The view renders either a timestamp
    // row (HH:MM:SS) for each recorded entry, or the "No recorded events
    // yet." empty state. Today, Session-mode lifecycle clicks go via
    // engine.invoke/dispatch which don't broadcast reports — so the History
    // buffer can be empty in this fixture. Accept either outcome; this
    // assertion locks in that the History toggle and view component are
    // reachable from Session mode.
    console.log("[e2e] switching trace to History view");
    await panel.getByRole("button", { name: /^History$/i }).click();
    const timestampOrEmpty = panel.locator("text=/\\d{2}:\\d{2}:\\d{2}|No recorded events yet/i").first();
    await timestampOrEmpty.waitFor({ timeout: 3_000 });

    // === Host tab ===
    // Exercises the mock-host-bridge surface added in Phase 7+8: preset
    // dropdown populates the JSON payload textarea, and the pending-queue
    // empty-state copy renders (this fixture has no host_call_await listener,
    // so no entry is queued from the listener path; the form.submit envelope
    // is captured but doesn't add to the host_call queue).

    console.log("[e2e] switching to Host tab");
    await panel.getByRole("button", { name: /^Host$/i }).click();

    // Wait for the Default response section heading.
    await panel.getByText(/Default response/i).waitFor({ timeout: 5_000 });

    // Pick the submit-success preset via the preset <select>. Use accessible
    // name (label "Preset") since useId generates non-stable ids.
    console.log("[e2e] picking submit-success preset");
    await panel
      .getByLabel(/^Preset$/i)
      .first()
      .selectOption("submit-success");

    // Verify the JSON payload populated. The submit-success preset payload
    // includes "ok: true" — assert the textarea content reflects it.
    const payloadTextarea = panel.getByLabel(/Payload \(JSON\)/i).first();
    await payloadTextarea.waitFor({ timeout: 3_000 });
    const payloadValue = await payloadTextarea.inputValue();
    if (!payloadValue.includes('"ok"')) {
      throw new Error(`preset did not populate payload textarea (got: ${payloadValue.slice(0, 120)}…)`);
    }

    // Pending queue: assert either the empty-state copy or queue rows render.
    // This fixture has no host_call_await listener, so we expect empty-state.
    console.log("[e2e] asserting pending queue renders (empty or rows)");
    const emptyCount = await panel.locator("text=/No pending host calls/i").count();
    const queueRowCount = await panel.locator("button[aria-expanded]").count();
    if (emptyCount === 0 && queueRowCount === 0) {
      throw new Error("Host tab pending section did not render either empty state or queue rows");
    }

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
