// SPDX-FileCopyrightText: Copyright (c) 2026 Enrico Lionello (enri3l) and Giulia Montevecchi (giulmonte), monte3l
// SPDX-License-Identifier: MIT

/**
 * How a repository's copy of a workflow template is compared with the template.
 * Pure functions, no I/O: `bin/template-sync.mjs` reads the files and passes the
 * text in.
 *
 * A copy is never judged by raw text. The template is first **rendered** for the
 * repository (its site URL, its optional blocks). Then two comparisons are made,
 * and they are deliberately not equally forgiving:
 *
 *   lenient  ignores comments, blank lines, the SPDX header and action pins,
 *            because none of them changes what a workflow does. It decides that
 *            nothing needs doing, so being generous can only ever mean "leave it
 *            alone".
 *   strict   ignores only blank lines, the SPDX header and action pins. Comments
 *            count. It decides that a copy is STALE, which is the one verdict
 *            that lets a sync overwrite a file, so it must never be generous.
 *
 * The distinction matters because a line that starts with `#` is not always a
 * comment: inside a `run: |` block it is a shell comment, a heredoc heading or a
 * JavaScript private field, and a person who commented a step out on purpose has
 * left a comment behind.
 *
 * The result is one of:
 *
 *   IDENTICAL   the copy is the rendered template, byte for byte
 *   EQUIVALENT  the same behaviour: only comments, blank lines or pins differ
 *   STALE       strictly equal to an OLDER version of the template, so the
 *               template has moved on and the copy has not
 *   CUSTOM      anything else: a person's change, never overwritten
 */

// A header line in either comment form: `#` for a workflow, a shell script or TOML, `//` for a module.
const SPDX_RE = /^\s*(?:#|\/\/)\s*SPDX-/;
const SIMPLE_VALUE_RE = /^(\s*(?:-\s+)?[A-Za-z0-9_.-]+:\s+[^\s'"`#]+)\s+#.*$/;
const USES_COMMENT_RE = /^(\s*(?:-\s+)?uses:\s*\S+)\s+#.*$/;
// Anchored to the start of the line and never able to cross an `@`, so it is linear.
const PIN_RE = /^(\s*(?:-\s+)?uses:\s*[^\s@]+)@[0-9a-f]{40}\b/;
const PLACEHOLDER_SITE = "https://PROJECT.monte3l.com";
const MARKER_LIKE_RE = /^\s*#\s*sync:/;
const OPEN_RE = /^\s*#\s*sync:if\s+(\S+)\s*$/;
const END_RE = /^\s*#\s*sync:end\s*$/;

/** @param {string} text @returns {string} the text without trailing slashes */
function trimSlashes(text) {
  let end = text.length;
  while (end > 0 && text[end - 1] === "/") end -= 1;
  return text.slice(0, end);
}

/**
 * The template as one repository should have it. A marker that is not exactly
 * `# sync:if FLAG` or `# sync:end`, an unclosed block, a block inside a block and
 * an end with no start are all errors: a half-understood marker would leave a
 * block in or out of every repository for no visible reason.
 *
 * @param {string} template
 * @param {{ site?: string, flags?: string[], defaultBranch?: string }} repo
 * @returns {string}
 * @throws {Error} when the markers are malformed
 */
export function render(template, { site, flags = [], defaultBranch = "main" }) {
  const lines = [];
  let open = false;
  let skipping = false;
  for (const line of template.split("\n")) {
    if (MARKER_LIKE_RE.test(line)) {
      const start = OPEN_RE.exec(line);
      if (start) {
        if (open) throw new Error("a sync:if block opens inside another");
        open = true;
        skipping = !flags.includes(start[1]);
      } else if (END_RE.test(line)) {
        if (!open) throw new Error("sync:end with no sync:if");
        open = false;
        skipping = false;
      } else {
        throw new Error(`not a valid sync marker: ${line.trim()}`);
      }
      continue;
    }
    if (!skipping) lines.push(line);
  }
  if (open) throw new Error("sync:if is never closed");
  let text = lines.join("\n").replaceAll("$default-branch", defaultBranch);
  if (site) text = text.replaceAll(PLACEHOLDER_SITE, trimSlashes(site));
  return text;
}

const pins = (line) => line.replace(PIN_RE, "$1@PIN");

/**
 * The lines of a file that are not its SPDX header and not blank. The header is one definition (`headerOf`),
 * used here to compare and in `keepHeader` to write, so a line that mentions SPDX anywhere else counts as
 * the file's own text: such a copy is a person's, and never overwritten.
 *
 * @param {string} text
 * @returns {string[]}
 */
function body(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const header = headerOf(lines);
  return lines.filter((line, i) => (i < header.start || i >= header.end) && line.trim() !== "");
}

/**
 * The lenient form: the behaviour of a workflow, as lines. No SPDX header, no
 * comments, no blank lines, no trailing comment on a simple `key: value` or
 * `uses:` line, and no action pin.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function lenient(text) {
  return body(text)
    .filter((line) => !/^\s*#/.test(line))
    .map((line) => pins(line.replace(USES_COMMENT_RE, "$1").replace(SIMPLE_VALUE_RE, "$1")).trimEnd());
}

/**
 * The strict form: only the SPDX header, blank lines and action pins (with the
 * version comment that follows a pin) are dropped. Every other comment stays.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function strict(text) {
  return body(text).map((line) => pins(line.replace(USES_COMMENT_RE, "$1")).trimEnd());
}

const same = (a, b) => a.length === b.length && a.every((line, i) => line === b[i]);

/**
 * Where a file's SPDX header sits: the run of `SPDX-` comment lines at the top, after a shebang if there
 * is one and after any blank lines that follow it, and then the blank lines that separate it from the
 * rest. A line that says SPDX anywhere else is not the header. A file with none has `start === end`.
 *
 * @param {string[]} lines
 * @returns {{ s: number, start: number, end: number, gap: number }}
 *   `s` is the line after a shebang, `[start, end)` the header and `gap` the blank lines after it
 */
function headerOf(lines) {
  const s = lines[0]?.startsWith("#!") ? 1 : 0;
  let start = s;
  while (start < lines.length && lines[start].trim() === "") start += 1;
  // The run may have a blank line inside it, as long as an SPDX line follows: it stops at the first other text.
  let end = start;
  for (let i = start; i < lines.length; i += 1) {
    if (SPDX_RE.test(lines[i])) end = i + 1;
    else if (lines[i].trim() !== "") break;
  }
  if (end === start) return { s, start: s, end: s, gap: 0 };
  let gap = 0;
  while (end + gap < lines.length && lines[end + gap].trim() === "") gap += 1;
  return { s, start, end, gap };
}

/**
 * The refreshed file, carrying the header the repository's own copy has. A repository decides what
 * licence header its files carry (REUSE or an inline check of it), so a refresh changes the behaviour
 * and leaves the header alone: the copy's header is kept as it is, and a copy with none gets none,
 * even if the template has one.
 *
 * @param {string} current the template, rendered for this repository
 * @param {string} copy the repository's file
 * @returns {string}
 */
export function keepHeader(current, copy) {
  const next = current.split("\n");
  const mine = copy.replace(/\r\n/g, "\n").split("\n");
  const theirs = headerOf(next);
  const own = headerOf(mine);
  const ownHeader = mine.slice(own.start, own.end);
  // A template with no header keeps its text as it is, which also keeps a file with none unchanged.
  if (theirs.end === theirs.start && ownHeader.length === 0) return current;
  const before = ownHeader.length === 0 ? [] : Array(own.start - own.s).fill("");
  const after = ownHeader.length === 0 ? [] : Array(own.gap).fill("");
  return [...next.slice(0, theirs.s), ...before, ...ownHeader, ...after, ...next.slice(theirs.end + theirs.gap)].join("\n");
}

/**
 * @param {string} copy the repository's file
 * @param {string} current the template, rendered for this repository
 * @param {string[]} history older versions of the template, newest first, each rendered the same way
 * @returns {{ state: "IDENTICAL" | "EQUIVALENT" | "STALE" | "CUSTOM", back?: number }}
 *   `back` counts versions that differ in more than comments, blank lines or pins
 */
export function classify(copy, current, history = []) {
  if (copy.replace(/\r\n/g, "\n").trim() === current.trim()) return { state: "IDENTICAL" };
  if (same(lenient(copy), lenient(current))) return { state: "EQUIVALENT" };
  // Older versions are grouped by what they DO, so a commit that only touched a comment or a pin is
  // not a version "behind". Whether the copy is one of them is decided strictly, comments included.
  const behaviour = lenient(current);
  const groups = [];
  for (const text of history) {
    const does = lenient(text);
    if (same(does, behaviour)) continue;
    let group = groups.find((g) => same(g.does, does));
    if (!group) groups.push((group = { does, exact: [] }));
    group.exact.push(strict(text));
  }
  const mine = strict(copy);
  const back = groups.findIndex((g) => g.exact.some((lines) => same(lines, mine)));
  return back === -1 ? { state: "CUSTOM" } : { state: "STALE", back: back + 1 };
}

const JOB_NAME_RE = /^ {4}name:[ \t]*(\S.*?)[ \t]*$/;

/**
 * The `name:` of every job, sorted. A required status check is a job name, so a
 * refresh that changes this set would silently stop a check that `main` waits for.
 *
 * @param {string} text a workflow file
 * @returns {string[]}
 */
export function jobNames(text) {
  const names = [];
  let inJobs = false;
  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    if (/^jobs:[ \t]*$/.test(line)) inJobs = true;
    else if (/^\S/.test(line) && !line.startsWith("#")) inJobs = false;
    else if (inJobs) {
      const match = JOB_NAME_RE.exec(line);
      if (match) names.push(match[1].replace(/^(["'])(.*)\1$/, "$2"));
    }
  }
  return names.sort();
}

/**
 * Everything the sync compares for one repository: the workflow templates and
 * the verbatim starters, each with the paths a repository may keep it at. The
 * first path is where a new repository gets it (`blueprint/bootstrap.json`), the
 * others are the places the baseline also accepts. A repository whose file lives
 * elsewhere says so in `repos.<name>.paths`.
 *
 * A repository may also leave a unit out (`repos.<name>.skip`, a list of template or starter
 * names): it is looked at by nobody and never touched, which is how a repository that keeps its
 * own version of a file on purpose says so without that copy being reported as a finding forever.
 *
 * @param {{
 *   templates: Record<string, string>,
 *   starters?: Record<string, { mode: string, paths: string[], requires?: string[] }>,
 *   repos?: Record<string, { paths?: Record<string, string>, skip?: string[] }>,
 * }} config blueprint/sync.json
 * @param {string} repo
 * @returns {Array<{ name: string, kind: "workflow" | "starter", source: string, managed: boolean, paths: string[], requires: string[], skipped: boolean }>}
 */
export function unitsFor(config, repo) {
  const override = config.repos?.[repo]?.paths ?? {};
  const skip = new Set(config.repos?.[repo]?.skip ?? []);
  const byName = ([a], [b]) => (a < b ? -1 : a > b ? 1 : 0);
  const workflows = Object.entries(config.templates)
    .sort(byName)
    .map(([name, mode]) => ({
      name,
      kind: /** @type {const} */ ("workflow"),
      source: `workflow-templates/${name}.yml`,
      managed: mode === "managed",
      paths: [override[name] ?? `.github/workflows/${name}.yml`],
      requires: [],
      skipped: skip.has(name),
    }));
  const starters = Object.entries(config.starters ?? {})
    .sort(byName)
    .map(([name, entry]) => ({
      name,
      kind: /** @type {const} */ ("starter"),
      source: `blueprint/files/${name}`,
      managed: entry.mode === "managed",
      paths: override[name] ? [override[name]] : entry.paths,
      requires: entry.requires ?? [],
      skipped: skip.has(name),
    }));
  return [...workflows, ...starters];
}

/**
 * A starter that needs another one (`requires` in sync.json: the push guard imports
 * `signed-range.mjs`, and a guard refreshed beside a helper that is its own, older or missing
 * cannot work) is refreshed only when every starter it needs, in the same repository, is current
 * or is refreshed in the same run. Otherwise it is HELD: the rows say why, nothing is written for
 * it, and the findings say that a person refreshes the pair together.
 *
 * @param {Array<{ template: string, kind: string, managed: boolean, state: string, path: string }>} rows
 *   one repository's rows
 * @param {{ starters?: Record<string, { requires?: string[] }> }} config
 * @returns {Array<object>} the rows, a held one with `state: "HELD"` and `reason`
 */
export function holdUncoupled(rows, config) {
  const byName = new Map(rows.map((row) => [row.template, row]));
  const ready = (need) =>
    need.state === "IDENTICAL" || need.state === "EQUIVALENT" || (need.state === "STALE" && need.managed);
  return rows.map((row) => {
    if (row.kind !== "starter" || !row.managed || row.state !== "STALE") return row;
    for (const name of config.starters?.[row.template]?.requires ?? []) {
      const need = byName.get(name);
      if (need && ready(need)) continue;
      const why = !need || need.state === "MISSING" ? "is missing" : need.state === "CUSTOM" ? "is custom" : need.state === "SKIPPED" ? "is skipped" : "is not managed";
      return { ...row, state: "HELD", reason: `${need?.path ?? name} ${why}` };
    }
    return row;
  });
}

/**
 * The finding for a refresh that is held back by a starter it needs.
 *
 * @param {{ repo: string, path: string, back: number, reason: string }} row
 * @returns {string}
 */
export function describeHeld(row) {
  return `${row.repo}: ${row.path} is ${row.back} version${row.back === 1 ? "" : "s"} behind its starter, but is not refreshed: ${row.reason}. Refresh the pair together by hand`;
}

/**
 * The one line a stale managed copy gets in the findings. A workflow keeps the
 * wording it always had, so an open issue does not change its text for no reason.
 *
 * @param {{ repo: string, template: string, kind: string, path: string, back: number }} row
 * @returns {string}
 */
export function describeStale(row) {
  const file = row.kind === "workflow" ? `${row.template}.yml` : row.path;
  const of = row.kind === "workflow" ? "template" : "starter";
  return `${row.repo}: ${file} is ${row.back} version${row.back === 1 ? "" : "s"} behind its ${of}`;
}
