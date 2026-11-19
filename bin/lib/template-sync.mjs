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

const SPDX_RE = /^\s*#\s*SPDX-/;
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
const blankOrSpdx = (line) => SPDX_RE.test(line) || line.trim() === "";

/**
 * The lenient form: the behaviour of a workflow, as lines. No SPDX header, no
 * comments, no blank lines, no trailing comment on a simple `key: value` or
 * `uses:` line, and no action pin.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function lenient(text) {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((line) => !blankOrSpdx(line) && !/^\s*#/.test(line))
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
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((line) => !blankOrSpdx(line))
    .map((line) => pins(line.replace(USES_COMMENT_RE, "$1")).trimEnd());
}

const same = (a, b) => a.length === b.length && a.every((line, i) => line === b[i]);

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

const USES_LINE_RE = /^\s*(?:-\s+)?uses:\s*([^\s@]+)@[0-9a-f]{40}\b/;

/**
 * The rendered template with the repository's own pins kept. The classifier
 * ignores pins, so a template that only moved a pin never makes a copy stale:
 * a refresh must not move one either, or it could put back an action version
 * that Dependabot in the repository had already replaced. An action the copy
 * does not use takes the template's line.
 *
 * @param {string} current the template, rendered for the repository
 * @param {string} copy the repository's file
 * @returns {string}
 */
export function keepPins(current, copy) {
  const own = new Map();
  for (const line of copy.replace(/\r\n/g, "\n").split("\n")) {
    const match = USES_LINE_RE.exec(line);
    if (match) own.set(match[1], [...(own.get(match[1]) ?? []), line]);
  }
  return current
    .split("\n")
    .map((line) => {
      const match = USES_LINE_RE.exec(line);
      const mine = match && own.get(match[1]);
      // Taken in order, so two uses of one action each keep their own pin.
      return mine && mine.length > 0 ? mine.shift() : line;
    })
    .join("\n");
}
