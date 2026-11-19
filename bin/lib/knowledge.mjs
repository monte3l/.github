// SPDX-FileCopyrightText: Copyright (c) 2026 Enrico Lionello (enri3l) and Giulia Montevecchi (giulmonte), monte3l
// SPDX-License-Identifier: MIT

/**
 * What the `knowledge/` wiki is made of, and the rules it must keep. Pure
 * functions, no I/O: `bin/knowledge-parity.mjs` (the build gate) and
 * `bin/knowledge-report.mjs` (the weekly staleness report) read the files and
 * pass the text in. The schema in prose is `knowledge/CLAUDE.md`.
 *
 * A wiki page and a source card each start with a small frontmatter block of
 * `key: value` lines and `- item` lists, nothing else, so no YAML parser is
 * needed and a malformed block is an error, never a guess.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const LOG_HEADING_RE = /^## \[(\d{4}-\d{2}-\d{2})\] (ingest|query|lint|decision) \| \S.*$/;
export const LOG_KINDS = ["ingest", "query", "lint", "decision"];

/** @param {string} text @returns {boolean} a real calendar date written YYYY-MM-DD */
export function isDate(text) {
  if (typeof text !== "string" || !DATE_RE.test(text)) return false;
  const date = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
}

/**
 * @param {string} text a whole markdown file
 * @returns {{ data: Record<string, string | string[]>, body: string } | { error: string } | null}
 *   null when the file has no frontmatter, `{ error }` when the block is not the supported shape
 */
export function parseFrontmatter(text) {
  const source = text.replace(/\r\n/g, "\n");
  const match = /^---\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(source);
  if (!match) return null;
  const data = {};
  let key = null;
  for (const line of match[1].split("\n")) {
    if (line.trim() === "") continue;
    const pair = /^([a-z][a-z-]*):[ \t]*(.*)$/.exec(line);
    const item = /^[ \t]+-[ \t]+(\S.*)$/.exec(line);
    if (pair) {
      key = pair[1];
      if (Object.hasOwn(data, key)) return { error: `duplicate frontmatter key "${key}"` };
      data[key] = pair[2].trim() === "" ? [] : pair[2].trim();
    } else if (item && key !== null && Array.isArray(data[key])) {
      data[key].push(item[1].trim());
    } else {
      return { error: `unsupported frontmatter line "${line.trim()}"` };
    }
  }
  return { data, body: source.slice(match[0].length) };
}

/** @param {string} text @returns {string} the text with every fenced code block blanked, line for line */
function withoutFences(text) {
  let inFence = false;
  return text
    .split("\n")
    .map((line) => {
      if (/^\s*(`{3,}|~{3,})/.test(line)) {
        inFence = !inFence;
        return "";
      }
      return inFence ? "" : line;
    })
    .join("\n");
}

/** @param {string} body @returns {string | null} the text of the first H1, not one inside fenced code */
function firstHeading(body) {
  return /^# (\S.*)$/m.exec(withoutFences(body))?.[1] ?? null;
}

/**
 * The problems of one wiki page: frontmatter with a valid `reviewed` date and at
 * least one source, every source a card that exists or an https URL, an H1, and a
 * visible `**Reviewed:**` line that says the same date as the frontmatter.
 *
 * @param {string} rel the page's path, for messages
 * @param {string} text
 * @param {Set<string>} cards the card paths that exist, such as `raw/a.md`
 * @returns {string[]}
 */
export function wikiPageProblems(rel, text, cards) {
  const parsed = parseFrontmatter(text);
  if (parsed === null) return [`${rel}: no frontmatter (it needs "reviewed" and "sources")`];
  if ("error" in parsed) return [`${rel}: ${parsed.error}`];
  const { data, body } = parsed;
  const problems = [];
  if (!isDate(data.reviewed)) problems.push(`${rel}: "reviewed" must be a date, YYYY-MM-DD`);
  if (!Array.isArray(data.sources) || data.sources.length === 0) {
    problems.push(`${rel}: "sources" must list at least one source`);
  } else {
    for (const source of data.sources) {
      if (/^https:\/\/\S+$/.test(source)) continue;
      if (!/^raw\/[a-z0-9][a-z0-9-]*\.md$/.test(source)) {
        problems.push(`${rel}: source "${source}" is neither a card under raw/ nor an https URL`);
      } else if (!cards.has(source)) {
        problems.push(`${rel}: source "${source}" does not exist`);
      }
    }
  }
  if (firstHeading(body) === null) problems.push(`${rel}: no "# " heading`);
  // The first non-empty line after the title is the status line, and it carries the date.
  const lines = withoutFences(body).split("\n");
  const afterTitle = lines.slice(lines.findIndex((line) => /^# \S/.test(line)) + 1).find((line) => line.trim() !== "") ?? "";
  const visible = /\*\*Reviewed:\*\* (\d{4}-\d{2}-\d{2})/.exec(afterTitle)?.[1];
  if (visible === undefined) {
    problems.push(`${rel}: the line under the title must carry "**Reviewed:** YYYY-MM-DD"`);
  } else if (visible !== data.reviewed) {
    problems.push(`${rel}: the visible Reviewed date ${visible} differs from the frontmatter ${String(data.reviewed)}`);
  }
  return problems;
}

/**
 * The problems of one source card: frontmatter with an https `url` and a valid
 * `accessed` date, and an H1.
 *
 * @param {string} rel
 * @param {string} text
 * @returns {string[]}
 */
export function cardProblems(rel, text) {
  const parsed = parseFrontmatter(text);
  if (parsed === null) return [`${rel}: no frontmatter (it needs "url" and "accessed")`];
  if ("error" in parsed) return [`${rel}: ${parsed.error}`];
  const problems = [];
  if (typeof parsed.data.url !== "string" || !/^https:\/\/\S+$/.test(parsed.data.url)) {
    problems.push(`${rel}: "url" must be an https URL`);
  }
  if (!isDate(parsed.data.accessed)) problems.push(`${rel}: "accessed" must be a date, YYYY-MM-DD`);
  if (firstHeading(parsed.body) === null) problems.push(`${rel}: no "# " heading`);
  return problems;
}

/**
 * The log is append-only and chronological: every `## ` heading is
 * `## [YYYY-MM-DD] kind | title` with a known kind, and no date is earlier than
 * the one before it.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function logProblems(text) {
  const problems = [];
  let previous = "";
  // Blank the fenced code first, so an example heading in it is not an entry. The
  // line numbers stay right because every line is kept.
  withoutFences(text.replace(/\r\n/g, "\n")).split("\n").forEach((line, index) => {
    if (!line.startsWith("## ")) return;
    const match = LOG_HEADING_RE.exec(line);
    if (match === null) {
      problems.push(`knowledge/log.md:${index + 1}: "${line}" is not "## [YYYY-MM-DD] ${LOG_KINDS.join("|")} | title"`);
      return;
    }
    if (!isDate(match[1])) problems.push(`knowledge/log.md:${index + 1}: ${match[1]} is not a date`);
    else if (match[1] < previous) problems.push(`knowledge/log.md:${index + 1}: ${match[1]} is earlier than the entry above it (the log only grows at the end)`);
    previous = match[1] > previous ? match[1] : previous;
  });
  return problems;
}

/**
 * @param {string} indexText knowledge/README.md
 * @param {string[]} wikiFiles file names under knowledge/wiki/
 * @returns {string[]} one message per wiki page the index does not link
 */
export function indexProblems(indexText, wikiFiles) {
  const prose = withoutFences(indexText).replace(/`[^`\n]*`/g, "");
  return wikiFiles
    .filter((file) => !new RegExp(`\\]\\((?:\\./)?wiki/${file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:#[^)\\s]*)?(?:\\s+"[^"]*")?\\)`).test(prose))
    .map((file) => `knowledge/README.md: the index does not link wiki/${file}`);
}

/**
 * @param {string} from a YYYY-MM-DD date
 * @param {string} to a YYYY-MM-DD date
 * @returns {number} whole days from `from` to `to`
 */
export function daysBetween(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/**
 * What a person should look at: pages not reviewed within `maxAgeDays`, a
 * `reviewed` date in the future (which would hide a page from this report for
 * good), a page whose date cannot be read, cards no wiki page cites, and a page
 * that cites a card that is gone.
 *
 * @param {{ pages: Array<{ rel: string, reviewed: string | null, sources: string[] }>, cards: string[], today: string, maxAgeDays: number }} input
 * @returns {string[]} one line each: `STALE`, `FUTURE`, `INVALID`, `ORPHAN` or `DEAD`
 */
export function reviewFindings({ pages, cards, today, maxAgeDays }) {
  const findings = [];
  const cited = new Set(pages.flatMap((page) => page.sources));
  for (const page of [...pages].sort((a, b) => a.rel.localeCompare(b.rel))) {
    if (page.reviewed === null) {
      findings.push(`INVALID ${page.rel}: its frontmatter cannot be read, see node design/source/docs-kit/build.mjs --check`);
    } else {
      const age = daysBetween(page.reviewed, today);
      if (age > maxAgeDays) findings.push(`STALE   ${page.rel}: reviewed ${page.reviewed}, ${age} days ago (limit ${maxAgeDays})`);
      if (age < 0) findings.push(`FUTURE  ${page.rel}: reviewed ${page.reviewed}, which is after today (${today}); a date ahead of time hides the page from this report`);
    }
    for (const source of page.sources) {
      if (source.startsWith("raw/") && !cards.includes(source)) findings.push(`DEAD    ${page.rel}: cites ${source}, which does not exist`);
    }
  }
  for (const card of [...cards].sort()) {
    if (!cited.has(card)) findings.push(`ORPHAN  ${card}: no wiki page cites it`);
  }
  return findings;
}
