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
 *   disagree about which repositories exist or where their sites are;
 * - a card line, description or topic breaks the wording standard (length,
 *   no final dot or ellipsis, no colon or semicolon list, US spelling,
 *   lowercase topics), or a profile row does not carry its repository's
 *   description, or the profile tagline is not `blueprint/org.json`'s
 *   description.
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

/** The wording standard for the text the org publishes about each repository. */
export const LIMITS = { card: 120, description: 200, topics: 8 };
const UK_SPELLING = /\b(organis\w*|colour\w*|behaviour\w*|centre\w*|licence)\b/i;

/**
 * @param {string} where a label for the message
 * @param {string} text a card line, description or org description
 * @param {number} limit the longest it may be, in characters
 * @returns {string[]}
 */
export function wordingProblems(where, text, limit) {
  const problems = [];
  if (typeof text !== "string" || text === "") return [`${where}: must be a non-empty string`];
  if (text.length > limit) problems.push(`${where}: ${text.length} characters, the limit is ${limit}`);
  if (/[.\u2026\s]$/.test(text)) problems.push(`${where}: ends in a dot, an ellipsis or a space`);
  if (/[:;]/.test(text)) problems.push(`${where}: has a colon or a semicolon, which makes a list; use one clause`);
  const uk = UK_SPELLING.exec(text);
  if (uk) problems.push(`${where}: "${uk[0]}" is UK spelling, the org uses US`);
  return problems;
}

/**
 * @param {Array<{ repo: string, card: string, description: string, topics: string[] }>} projects
 * @param {{ description: string }} org
 * @param {string} profile profile/README.md
 * @returns {string[]}
 */
export function descriptionProblems(projects, org, profile) {
  const problems = [];
  for (const { repo, card, description, topics } of projects) {
    problems.push(...wordingProblems(`${repo} card`, card, LIMITS.card));
    problems.push(...wordingProblems(`${repo} description`, description, LIMITS.description));
    if (!Array.isArray(topics) || topics.length === 0 || topics.length > LIMITS.topics) {
      problems.push(`${repo} topics: needs 1 to ${LIMITS.topics} entries`);
    } else {
      for (const topic of topics) {
        if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(topic)) problems.push(`${repo} topics: "${topic}" must be lowercase words joined by hyphens`);
      }
    }
    const row = profile.split("\n").find((line) => line.startsWith(`| [${repo}](`));
    if (row && !row.includes(`| ${description}. Docs at `)) {
      problems.push(`profile/README.md: the ${repo} row does not carry its description from blueprint/projects.json`);
    }
  }
  problems.push(...wordingProblems("blueprint/org.json description", org.description, LIMITS.card));
  if (!profile.includes(`\n${org.description}.\n`)) {
    problems.push("profile/README.md: the tagline under the title is not blueprint/org.json's description plus a full stop");
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
  const profile = await read("profile/README.md");
  problems.push(...projectProblems(projects, profileRows(profile)));
  problems.push(...descriptionProblems(projects, JSON.parse(await read("blueprint/org.json")), profile));
  return problems;
}
