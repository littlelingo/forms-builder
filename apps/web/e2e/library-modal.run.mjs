/**
 * Modal-layout E2E — LibraryPicker visual regression net.
 *
 * History: the LibraryPicker modal shipped with two visible layout regressions
 * caught only by manual inspection:
 *
 *   1. Category chips collapsed to width 0 — wrapped vertically into a column
 *      pushed off the right edge of the modal (commit 00c1362).
 *   2. Search input had `float: left` from USWDS reset, collapsing its parent
 *      to height 0; chip rows rendered overlapping the search input
 *      (commit fd206a7).
 *
 * Both bugs would have failed this test. It asserts the structural invariants
 * a healthy modal layout must satisfy: the search input has real height,
 * each chip row fills the dialog content width, and chip rows render
 * strictly below the search input with positive vertical gap.
 *
 * Usage:
 *   node apps/web/e2e/library-modal.run.mjs   # requires E2E_BASE_URL env var
 *   npm run e2e:library-modal                 # via orchestrator
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

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  page.on("console", (msg) => {
    if (msg.type() === "error") console.log(`[browser:${msg.type()}] ${msg.text()}`);
  });
  page.on("pageerror", (err) => {
    console.log(`[browser:pageerror] ${err.message}`);
  });

  let exitCode = 0;
  try {
    await installApiMocks(page);

    console.log(`[e2e] navigating to ${BASE_URL}`);
    await page.goto(BASE_URL, { waitUntil: "networkidle" });

    console.log("[e2e] opening fixture project");
    await page
      .getByRole("button", { name: /Checkbox to Radio E2E/i })
      .first()
      .click();

    const builderToolbar = page.getByRole("toolbar", { name: /Builder stage toolbar/i });
    await builderToolbar.waitFor({ timeout: 5_000 });

    console.log("[e2e] opening Form behavior");
    await page.getByRole("button", { name: /^Form behavior$/i }).click();

    console.log("[e2e] clicking + From library");
    await page.getByRole("button", { name: /\+ From library/i }).click();

    const dialog = page.locator('[role="dialog"][aria-labelledby="library-picker-title"]');
    await dialog.waitFor({ timeout: 5_000 });

    console.log("[e2e] asserting modal layout invariants");
    const layout = await page.evaluate(() => {
      const dlg = document.querySelector('[role="dialog"][aria-labelledby="library-picker-title"]');
      if (!dlg) return { error: "no dialog" };
      const header = dlg.children[0];
      const search = dlg.querySelector('input[type="search"]');
      const searchDiv = search?.parentElement;
      const wrapper = Array.from(header.children).find((c) => c.className.includes("mt-2.5"));
      if (!search || !searchDiv || !wrapper) return { error: "missing parts" };
      const cats = wrapper.children[0];
      const scopes = wrapper.children[1];
      const dlgR = dlg.getBoundingClientRect();
      const searchR = search.getBoundingClientRect();
      const sdR = searchDiv.getBoundingClientRect();
      const catsR = cats.getBoundingClientRect();
      const scopesR = scopes.getBoundingClientRect();
      return {
        dialogW: dlgR.width,
        searchInputH: searchR.height,
        searchDivH: sdR.height,
        searchInputFloat: getComputedStyle(search).float,
        catsW: catsR.width,
        scopesW: scopesR.width,
        catsTop: catsR.top,
        scopesTop: scopesR.top,
        searchBottom: sdR.bottom,
        gapSearchToCats: catsR.top - sdR.bottom,
      };
    });

    if (layout.error) throw new Error(`layout probe failed: ${layout.error}`);

    const assertions = [
      ["search input has real height", layout.searchInputH >= 30, `searchInputH=${layout.searchInputH}`],
      [
        "search div height matches input (parent not collapsed by float)",
        layout.searchDivH >= 30,
        `searchDivH=${layout.searchDivH}`,
      ],
      ["search input is not floated", layout.searchInputFloat === "none", `float=${layout.searchInputFloat}`],
      ["categories row has non-zero width", layout.catsW > 100, `catsW=${layout.catsW}`],
      ["scopes row has non-zero width", layout.scopesW > 100, `scopesW=${layout.scopesW}`],
      [
        "categories row fills dialog content width",
        layout.catsW >= 600,
        `catsW=${layout.catsW} vs dialogW=${layout.dialogW}`,
      ],
      ["categories row sits below search (positive gap)", layout.gapSearchToCats >= 4, `gap=${layout.gapSearchToCats}`],
      [
        "scopes row sits below categories",
        layout.scopesTop > layout.catsTop,
        `scopesTop=${layout.scopesTop} catsTop=${layout.catsTop}`,
      ],
    ];

    const failures = assertions.filter(([, ok]) => !ok);
    if (failures.length > 0) {
      const msg = failures.map(([name, , detail]) => `  - ${name}: ${detail}`).join("\n");
      throw new Error(`LibraryPicker layout invariants failed:\n${msg}\nlayout=${JSON.stringify(layout, null, 2)}`);
    }

    console.log(`[e2e] layout OK: ${JSON.stringify(layout)}`);

    console.log("\nLibraryPicker modal E2E PASSED.");
  } catch (error) {
    console.error("\nLibraryPicker modal E2E FAILED:");
    console.error(error.message);
    if (error.stack) console.error(error.stack.split("\n").slice(0, 4).join("\n"));
    try {
      const shotPath = new URL("./failure-library-modal.png", import.meta.url).pathname;
      await page.screenshot({ path: shotPath, fullPage: true });
      console.error(`[e2e] failure screenshot: ${shotPath}`);
    } catch (shotErr) {
      console.error("[e2e] could not capture failure screenshot:", shotErr.message);
    }
    exitCode = 1;
  } finally {
    await browser.close();
    process.exit(exitCode);
  }
}

main();
