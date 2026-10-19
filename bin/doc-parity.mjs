// SPDX-FileCopyrightText: Copyright (c) 2026 Enrico Lionello
// SPDX-License-Identifier: MIT

/**
 * The org repository's documentation-versus-code parity, run by the docs kit's
 * `--check` (listed in `docs.config.mjs` `parity`). It fails when:
 *
 * - the blueprint README's "Repository standard" table and
 *   `apply-repo-baseline.sh` name different items;
 * - a workflow template lacks its `.properties.json`, or the reverse;
 * - `blueprint/design-system.json` pins a version other than the one
 *   `design/README.md` records;
 * - `blueprint/projects.json` and the project table in `profile/README.md`
 *   disagree about which repositories exist or where their sites are.
 *
 * The status snapshot, if any, in `profile/README.md` is hand-kept and is not
 * checked.
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { INLINE_ITEMS, parseBaselineScript, printsInline } from "./lib/baseline-items.mjs";
import { assertSame, assertSameSet, codeSpans, section, tableColumn } from "../design/source/docs-kit/lib/parity.mjs";

/**
 * @param {string} readme blueprint/README.md
 * @param {string} script apply-repo-baseline.sh
 * @returns {string[]}
 */
export function baselineProblems(readme, script) {
  const problems = [];
  const body = section(readme, "Repository standard");
  if (body === null) return [`blueprint/README.md: no "Repository standard" section`];
  const documented = tableColumn(body, "Reported as").flatMap((cell) => codeSpans(cell));
  const parsed = parseBaselineScript(script);
  const inScript = [...parsed.reportFile, ...parsed.reportWorkflow, ...INLINE_ITEMS];
  problems.push(...assertSameSet("baseline items: README 'Reported as' vs the script", documented, inScript));
  for (const label of INLINE_ITEMS) {
    if (!printsInline(script, label)) {
      problems.push(`bin/lib/baseline-items.mjs lists "${label}", but the script never prints it as an OK or DRIFT line`);
    }
  }
  return problems;
}

/**
 * @param {string[]} files names in workflow-templates/
 * @returns {string[]}
 */
export function templateProblems(files) {
  const yml = files.filter((f) => f.endsWith(".yml")).map((f) => f.slice(0, -".yml".length));
  const props = files.filter((f) => f.endsWith(".properties.json")).map((f) => f.slice(0, -".properties.json".length));
  return assertSameSet("workflow templates: .yml vs .properties.json", props, yml);
}

/**
 * @param {string} profile profile/README.md
 * @returns {Map<string, string[]>} repo name to the https URLs on its table row
 */
export function profileRows(profile) {
  const rows = new Map();
  for (const line of profile.split("\n")) {
    const match = /^\|\s*\[[^\]]+\]\(https:\/\/github\.com\/monte3l\/([^)]+)\)/.exec(line);
    if (match) rows.set(match[1], [...line.matchAll(/\]\((https:\/\/[^)]+)\)/g)].map((m) => m[1].replace(/\/$/, "")));
  }
  return rows;
}

/**
 * @param {Array<{ repo: string, site: string }>} projects
 * @param {Map<string, string[]>} rows
 * @returns {string[]}
 */
export function projectProblems(projects, rows) {
  const problems = assertSameSet("projects: blueprint/projects.json vs profile/README.md table", rows.keys(), projects.map((p) => p.repo));
  for (const { repo, site } of projects) {
    const urls = rows.get(repo);
    if (urls && !urls.includes(site)) problems.push(`profile/README.md: the ${repo} row does not link its site ${site}`);
  }
  return problems;
}

export default async function parity({ root }) {
  const read = (rel) => readFile(path.join(root, rel), "utf8");
  const problems = [];
  problems.push(...baselineProblems(await read("blueprint/README.md"), await read("bin/apply-repo-baseline.sh")));
  problems.push(...templateProblems(await readdir(path.join(root, "workflow-templates"))));

  const pinned = JSON.parse(await read("blueprint/design-system.json")).version;
  const recorded = /^- \*\*Version copied:\*\* `([^`]+)`/m.exec(await read("design/README.md"))?.[1] ?? null;
  problems.push(...assertSame("design version: blueprint/design-system.json vs design/README.md", recorded, pinned));

  const projects = JSON.parse(await read("blueprint/projects.json"));
  problems.push(...projectProblems(projects, profileRows(await read("profile/README.md"))));
  return problems;
}
