// SPDX-FileCopyrightText: Copyright (c) 2026 Enrico Lionello (enri3l) and Giulia Montevecchi (giulmonte), monte3l
// SPDX-License-Identifier: MIT

/**
 * Reads a repository's ROADMAP.md against the tracking policy
 * (blueprint/tracking.md): five headings in a fixed order and a valid
 * `reviewed:` date in the frontmatter. It is the one parser behind the
 * `roadmap: sections` baseline item, so the script and the tests cannot
 * disagree about what a ROADMAP is.
 *
 * It does not judge how old the date is. The docs kit owns page age (a page is
 * stale after 180 days), and a second age rule here would be a second
 * convention for the same date.
 *
 * As a command it reads the file on stdin and exits 0 when it is as the policy
 * says, 1 when it is not (each problem on stdout), 2 on a usage error. Run by
 * hand with `node bin/lib/roadmap.mjs --today 2027-01-01 < ROADMAP.md`.
 */
import { parseFrontmatter, isDate } from "./knowledge.mjs";

/**
 * The sections in the order the policy requires. A heading matches by prefix,
 * so `## Now: the 1.x series` is the `Now` section: the repositories already
 * qualify that heading with their release line.
 */
export const SECTIONS = ["Now", "Next 12 months", "Known limits", "Unverified", "What this project will not do"];

/** @param {string} heading the text after `## ` @param {string} section @returns {boolean} */
const matches = (heading, section) => heading === section || heading.startsWith(`${section}:`) || heading.startsWith(`${section} `);

/**
 * @param {string} text a whole ROADMAP.md
 * @param {{ today?: string }} [options] today as YYYY-MM-DD, to reject a date that has not happened
 * @returns {string[]} what the policy says is wrong, empty when nothing is
 */
export function roadmapProblems(text, { today } = {}) {
  const problems = [];
  const source = text.replace(/\r\n/g, "\n");

  const front = parseFrontmatter(source);
  if (front === null) problems.push("no frontmatter: add a `reviewed: YYYY-MM-DD` line between two `---` lines");
  else if ("error" in front) problems.push(`frontmatter: ${front.error}`);
  else {
    const reviewed = front.data.reviewed;
    if (typeof reviewed !== "string" || reviewed === "") problems.push("frontmatter has no `reviewed:` date");
    else if (!isDate(reviewed)) problems.push(`\`reviewed: ${reviewed}\` is not a real YYYY-MM-DD date`);
    else if (today !== undefined && reviewed > today) problems.push(`\`reviewed: ${reviewed}\` has not happened yet`);
  }

  // Headings inside a fenced code block are examples, not sections.
  let fenced = false;
  const headings = [];
  for (const line of source.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    else if (!fenced) {
      const found = /^## (\S.*?)\s*$/.exec(line);
      if (found) headings.push(found[1]);
    }
  }

  let from = 0;
  for (const section of SECTIONS) {
    const index = headings.findIndex((heading, at) => at >= from && matches(heading, section));
    if (index !== -1) {
      from = index + 1;
    } else if (headings.some((heading) => matches(heading, section))) {
      problems.push(`\`## ${section}\` is out of order: the sections go ${SECTIONS.join(", ")}`);
    } else {
      problems.push(`no \`## ${section}\` section`);
    }
  }
  return problems;
}

/** The command line. Kept apart from the parser so a test can call it without a process. */
async function main(argv) {
  let today;
  for (let at = 0; at < argv.length; at += 1) {
    if (argv[at] === "--today" && isDate(argv[at + 1] ?? "")) {
      today = argv[at + 1];
      at += 1;
    } else {
      process.stderr.write("usage: node bin/lib/roadmap.mjs [--today YYYY-MM-DD] < ROADMAP.md\n");
      return 2;
    }
  }
  let text = "";
  for await (const chunk of process.stdin) text += chunk;
  const problems = roadmapProblems(text, { today });
  for (const problem of problems) process.stdout.write(`${problem}\n`);
  return problems.length === 0 ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exitCode = await main(process.argv.slice(2));
