// SPDX-FileCopyrightText: Copyright (c) 2026 Enrico Lionello
// SPDX-License-Identifier: MIT

/**
 * Reads the item labels out of `apply-repo-baseline.sh`, so the docs site's
 * check catalog and the docs-versus-script parity check share one parser.
 * The script is the source of truth: a label is whatever its first argument
 * says, and the parser never executes it.
 */

/**
 * Items the script prints with a hand-written `printf` rather than through
 * `settle`, `report_file` or `report_workflow`. Each label must appear in the
 * script as `OK     <label>` or `DRIFT  <label>`, which the parity check
 * verifies, so a rename in the script is caught here.
 */
export const INLINE_ITEMS = [
  "design system",
  "docs site: tier",
  "docs site: daily check",
  "docs site: homepage",
  "Node pin",
  "Scorecard alerts",
  "Dependabot",
];

/**
 * @param {string} script the text of apply-repo-baseline.sh
 * @returns {{ settle: string[], reportFile: string[], reportWorkflow: string[], skip: string[] }}
 */
export function parseBaselineScript(script) {
  // A label built from a shell variable (`ruleset: $name`) is one item per
  // blueprint file, not a fixed name, so it is not listed here.
  const labels = (fn) => [
    ...new Set(
      [...script.matchAll(new RegExp(`^\\s*${fn} "([^"]+)"`, "gm"))].map((m) => m[1]).filter((label) => !label.includes("$")),
    ),
  ];
  return {
    settle: labels("settle"),
    reportFile: labels("report_file"),
    reportWorkflow: labels("report_workflow"),
    skip: labels("skip"),
  };
}

/**
 * @param {string} script
 * @param {string} label
 * @returns {boolean} whether the script prints `label` as an OK or DRIFT line
 */
export function printsInline(script, label) {
  return script.includes(`'OK     ${label}`) || script.includes(`'DRIFT  ${label}`);
}
