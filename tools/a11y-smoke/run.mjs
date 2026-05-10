/**
 * A11y smoke test — runs axe-core against the built web app's key surfaces.
 * Fails (exit 1) when any "serious" or "critical" violations are found.
 *
 * Usage:
 *   node tools/a11y-smoke/run.mjs
 *
 * Env:
 *   A11Y_SMOKE_URL  Base URL of the running app (default: http://localhost:4173)
 */

import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const BASE_URL = process.env.A11Y_SMOKE_URL ?? "http://localhost:4173";

// Minimal route list for v1 — expand in future tasks as more routes stabilise.
const ROUTES = ["/"];

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  let totalViolations = 0;
  const failures = [];

  for (const route of ROUTES) {
    const url = `${BASE_URL}${route}`;
    console.log(`Scanning ${url}…`);
    await page.goto(url, { waitUntil: "networkidle" });

    const results = await new AxeBuilder({ page })
      .options({ runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] })
      .analyze();

    const seriousOrCritical = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");

    if (seriousOrCritical.length > 0) {
      totalViolations += seriousOrCritical.length;
      failures.push({ route, violations: seriousOrCritical });
      console.log(`  ✗ ${seriousOrCritical.length} serious/critical violation(s):`);
      for (const v of seriousOrCritical) {
        console.log(`    - [${v.impact}] ${v.id}: ${v.help}`);
        console.log(`      ${v.helpUrl}`);
        for (const node of v.nodes.slice(0, 3)) {
          console.log(`      → ${node.target.join(" ")}`);
        }
      }
    } else {
      console.log(`  ✓ no serious/critical violations`);
    }
  }

  await browser.close();

  if (totalViolations > 0) {
    console.error(`\nA11y smoke FAILED: ${totalViolations} violation(s) across ${failures.length} route(s).`);
    process.exit(1);
  }

  console.log("\nA11y smoke PASSED.");
}

main().catch((error) => {
  console.error("A11y smoke crashed:", error);
  process.exit(2);
});
