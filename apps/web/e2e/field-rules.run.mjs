/**
 * Field-rules E2E — wizard + listener round-trip.
 *
 * Opens the checkbox-to-radio fixture project, navigates to the Map tab →
 * Summary list → "Open in graph" to open BehaviorWorkspace with the checkbox
 * field selected, then opens the "Rules this field triggers" wizard, fills it
 * to create a hide rule for the sibling radio field, saves it, then fires a
 * field.change event via the TestPanel and asserts that the hide_node action
 * executed.
 *
 * Usage:
 *   node apps/web/e2e/field-rules.run.mjs   # requires E2E_BASE_URL env var
 *   npm run e2e:field-rules                 # via orchestrator (recommended)
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
  return { status, contentType: "application/json", body: JSON.stringify(body) };
}

async function installApiMocks(page) {
  const detail = buildCheckboxToRadioProjectDetail();
  const projectRecord = buildCheckboxToRadioProjectRecord();
  await page.route(new RegExp(`^${API_HOST}/`), (route) => route.fulfill(jsonResponse({ detail: "unmocked" }, 404)));
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
    await page.goto(BASE_URL, { waitUntil: "networkidle" });
    await page
      .getByRole("button", { name: /Checkbox to Radio E2E/i })
      .first()
      .click();
    await page.getByRole("toolbar", { name: /Builder stage toolbar/i }).waitFor({ timeout: 5_000 });

    // Navigate to Map tab → Summary list → Open in graph for the existing
    // listener (lst_benefit_requires_sex on field-benefit-type). That opens
    // BehaviorWorkspace with the checkbox field selected so the
    // "Rules this field triggers" (FieldRulesTriggers) section is visible.
    console.log("[e2e] opening Map inspector tab");
    await page.getByRole("button", { name: /^Map$/i }).click();

    console.log("[e2e] switching to Summary list");
    await page.getByRole("button", { name: /Summary list/i }).waitFor({ timeout: 5_000 });
    await page.getByRole("button", { name: /Summary list/i }).click();

    console.log("[e2e] clicking Open in graph for the existing listener");
    await page
      .getByRole("button", { name: /Open in graph/i })
      .first()
      .waitFor({ timeout: 5_000 });
    await page
      .getByRole("button", { name: /Open in graph/i })
      .first()
      .click();

    // BehaviorWorkspace is now open in the behavior studio modal (graph mode)
    // with field-benefit-type selected. FieldRulesTriggers renders below the graph.
    console.log("[e2e] opening wizard from trigger-field behavior section");
    const behaviorStudio = page.locator('[role="dialog"][aria-labelledby="behavior-studio-title"]');
    await behaviorStudio.waitFor({ timeout: 5_000 });
    await behaviorStudio.getByRole("button", { name: /\+ Add rule about another field/i }).waitFor({ timeout: 5_000 });
    await behaviorStudio.getByRole("button", { name: /\+ Add rule about another field/i }).click();

    const dialog = page.locator('[role="dialog"][aria-labelledby="field-rule-wizard-title"]');
    await dialog.waitFor({ timeout: 5_000 });

    console.log("[e2e] filling wizard");
    // Effect select (first <select> in the dialog body — nth 0)
    await dialog.locator("select").nth(0).selectOption("hide");
    // Affected field select (second <select> — nth 1); pick the radio sibling (field-sex)
    // Options: [0] "— pick a field —", [1] "Type of benefit(s) applying for" (checkbox itself),
    //          [2] "Sex" (radio). Pick index 2.
    const affectedSelect = dialog.locator("select").nth(1);
    const radioOptionValue = await affectedSelect.locator("option").nth(2).getAttribute("value");
    if (!radioOptionValue) throw new Error("could not find an affected field option at index 2");
    await affectedSelect.selectOption(radioOptionValue);
    // Trigger field (nth 2) should be pre-filled with field-benefit-type via initialTriggerFieldId,
    // but the useEffect that applies it runs after the first render. Wait until the wizard has
    // 5 selects (effect + affected + trigger + operator + value-picker) before grabbing the last
    // one, so we don't accidentally target the operator select when value-picker isn't yet mounted.
    await page.waitForFunction(
      () => {
        const dlg = document.querySelector('[role="dialog"][aria-labelledby="field-rule-wizard-title"]');
        return dlg ? dlg.querySelectorAll("select").length >= 5 : false;
      },
      undefined,
      { timeout: 5_000 },
    );
    // Operator (nth 3) defaults to "equals"; skip
    // Value picker — trigger is field-benefit-type (checkbox-group with options),
    // so a <select> appears with "Disability" / "Education" options (now safely the last select)
    const valueSelect = dialog.locator("select").last();
    const valueOption = await valueSelect.locator("option").nth(1).getAttribute("value");
    if (!valueOption) throw new Error("could not find a value option");
    await valueSelect.selectOption(valueOption);

    const addRuleBtn = dialog.getByRole("button", { name: /Add rule/i });
    await addRuleBtn.waitFor({ timeout: 5_000 });
    // Wait for React state to settle so the button is no longer disabled
    await page.waitForFunction(
      () => {
        const dlg = document.querySelector('[role="dialog"][aria-labelledby="field-rule-wizard-title"]');
        if (!dlg) return false;
        const buttons = Array.from(dlg.querySelectorAll("button"));
        const btn = buttons.find((b) => b.textContent?.trim() === "Add rule");
        return Boolean(btn && !btn.disabled);
      },
      undefined,
      { timeout: 5_000 },
    );
    await addRuleBtn.click();

    console.log("[e2e] asserting rule row appears in FieldRulesTriggers");
    await behaviorStudio.getByText(/Hide.+when this field equals/i).waitFor({ timeout: 5_000 });

    // Close the behavior studio to get back to the main canvas
    console.log("[e2e] closing behavior studio");
    await behaviorStudio.getByRole("button", { name: /Close behavior studio/i }).click();
    await behaviorStudio.waitFor({ state: "hidden", timeout: 5_000 });

    // Select the checkbox field on the canvas so the TestPanel pre-fills from it
    console.log("[e2e] selecting checkbox field on canvas");
    await page.getByText("Type of benefit(s) applying for").first().click();

    console.log("[e2e] firing field.change via TestPanel");
    await page.keyboard.press("Meta+K");
    const panel = page.locator('[role="dialog"][aria-label="Test panel"]');
    await panel.waitFor({ timeout: 5_000 });
    const nextValueInput = panel.locator('input[id$="-payload-nextValue"]');
    await nextValueInput.waitFor({ timeout: 5_000 });
    await nextValueInput.fill(valueOption);
    await panel.getByRole("button", { name: /Fire event/i }).click();

    console.log("[e2e] asserting hide_node trace");
    await panel.getByText(/hide_node/i).waitFor({ timeout: 5_000 });

    console.log("\nfield-rules E2E PASSED.");
  } catch (error) {
    console.error("\nfield-rules E2E FAILED:");
    console.error(error.message);
    if (error.stack) console.error(error.stack.split("\n").slice(0, 4).join("\n"));
    try {
      const shotPath = new URL("./failure-field-rules.png", import.meta.url).pathname;
      await page.screenshot({ path: shotPath, fullPage: true });
      console.error(`[e2e] failure screenshot: ${shotPath}`);
      const visibleText = await page.evaluate(() => document.body.innerText.slice(0, 2000));
      console.error("[e2e] visible body text (first 2000 chars):");
      console.error(visibleText);
    } catch (shotErr) {
      console.error("[e2e] could not capture failure screenshot:", shotErr.message);
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
