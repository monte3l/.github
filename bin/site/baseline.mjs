// SPDX-FileCopyrightText: Copyright (c) 2026 Enrico Lionello
// SPDX-License-Identifier: MIT

/**
 * Docs-kit generator: the baseline check catalog, read from
 * `bin/apply-repo-baseline.sh` itself, so the page lists exactly the items the
 * script runs.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { INLINE_ITEMS, parseBaselineScript } from "../lib/baseline-items.mjs";

const esc = (text) => String(text).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const code = (text) => `<code class="code m3l-code-inline">${esc(text)}</code>`;

export default async function generate({ root }) {
  const items = parseBaselineScript(await readFile(path.join(root, "bin/apply-repo-baseline.sh"), "utf8"));
  const rows = [
    ...items.settle.map((label) => [label, "Applied with --apply"]),
    ...items.reportFile.map((label) => [label, "Reported only: a file in the repository"]),
    ...items.reportWorkflow.map((label) => [label, "Reported only: a control in a workflow"]),
    ["ruleset: <name>", "Applied with --apply, one per file in blueprint/rulesets/"],
    ["label: <name>", "Applied with --apply, create-only, one per entry in blueprint/labels.json"],
    ...INLINE_ITEMS.map((label) => [label, "Reported only"]),
  ];
  const html = `<h1 id="baseline-checks">Baseline checks</h1>
<p class="body">Every item <code class="code m3l-code-inline">bin/apply-repo-baseline.sh</code> compares a repository against. A report-only item never changes the repository, because adopting it is a commit.</p>
<table>
<thead><tr><th>Item</th><th>Kind</th></tr></thead>
<tbody>
${rows.map(([label, kind]) => `<tr><td>${code(label)}</td><td>${esc(kind)}</td></tr>`).join("\n")}
</tbody>
</table>
`;
  return [{ out: "baseline.html", group: "Standard", label: "Baseline checks", html }];
}
