#!/usr/bin/env node
// SPDX-FileCopyrightText: Copyright (c) 2026 Enrico Lionello (enri3l) and Giulia Montevecchi (giulmonte), monte3l
// SPDX-License-Identifier: MIT

/**
 * What in the `knowledge/` wiki needs a person to look at.
 *
 *   node bin/knowledge-report.mjs [--max-age-days N] [--today YYYY-MM-DD]
 *
 * Prints one line per finding, then a summary:
 *
 *   STALE    a wiki page whose `reviewed` date is more than N days ago (default 180)
 *   FUTURE   a `reviewed` date after today, which would hide the page from this report
 *   INVALID  a wiki page whose frontmatter cannot be read (`--check` says why)
 *   ORPHAN   a source card that no wiki page cites
 *   DEAD     a wiki page that cites a card that does not exist
 *
 * It reads only the repository and never changes anything. A finding is not a
 * build failure, so a stale page cannot block a merge: `freshness.yml` turns the
 * report into one issue. The structure of the wiki is `bin/knowledge-parity.mjs`.
 *
 * Exit codes: 0 nothing to review, 1 something to review, 2 usage, 3 a file
 * could not be read.
 */
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const usage = (message) => {
  console.error(`knowledge-report: ${message}`);
  console.error("usage: node bin/knowledge-report.mjs [--max-age-days N] [--today YYYY-MM-DD]");
  process.exit(2);
};

const args = process.argv.slice(2);
const root = path.resolve(import.meta.dirname, "..");
const markdownIn = async (dir) => (existsSync(dir) ? (await readdir(dir)).filter((name) => name.endsWith(".md")).sort() : []);

try {
  // Loaded here, not at the top: a module that fails to load must exit 3 (it could not
  // check), never 1, which the workflow reads as "findings".
  const { isDate, parseFrontmatter, reviewFindings } = await import("./lib/knowledge.mjs");
  let maxAgeDays = 180;
  let today = new Date().toISOString().slice(0, 10);
  for (let i = 0; i < args.length; i += 2) {
    const value = args[i + 1];
    if (args[i] === "--max-age-days" && /^\d+$/.test(value ?? "")) maxAgeDays = Number(value);
    else if (args[i] === "--today" && isDate(value)) today = value;
    else usage(`cannot use "${args.slice(i, i + 2).join(" ")}"`);
  }
  const cards = (await markdownIn(path.join(root, "knowledge/raw"))).map((name) => `raw/${name}`);
  const pages = [];
  for (const name of await markdownIn(path.join(root, "knowledge/wiki"))) {
    const rel = `knowledge/wiki/${name}`;
    const parsed = parseFrontmatter(await readFile(path.join(root, rel), "utf8"));
    // A page whose date cannot be read is INVALID, not stale on an invented date. Its sources are
    // still collected when they parse, so the cards it cites are not reported as orphans.
    const data = parsed !== null && !("error" in parsed) ? parsed.data : {};
    pages.push({
      rel,
      reviewed: isDate(data.reviewed) ? data.reviewed : null,
      sources: Array.isArray(data.sources) ? data.sources : [],
    });
  }
  const findings = reviewFindings({ pages, cards, today, maxAgeDays });
  for (const line of findings) console.log(line);
  console.log(`\n${findings.length} to review (${pages.length} pages, ${cards.length} cards, limit ${maxAgeDays} days)`);
  process.exitCode = findings.length === 0 ? 0 : 1;
} catch (error) {
  console.error(`knowledge-report: ${error.message}`);
  process.exitCode = 3;
}
