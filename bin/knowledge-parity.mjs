// SPDX-FileCopyrightText: Copyright (c) 2026 Enrico Lionello (enri3l) and Giulia Montevecchi (giulmonte), monte3l
// SPDX-License-Identifier: MIT

/**
 * Parity for the `knowledge/` wiki, run by the docs kit's `--check` (listed in
 * `docs.config.mjs` `parity`). It fails when a wiki page or a source card breaks
 * the shape `knowledge/CLAUDE.md` describes: a missing or malformed frontmatter
 * field, a source that does not exist, a page the index does not link or the
 * docs config does not publish, or a log entry that is out of order.
 *
 * Staleness is not checked here. A page that has gone unreviewed is a matter for
 * a person, reported weekly by `bin/knowledge-report.mjs`, and must never stop a
 * merge. A repository without a `knowledge/` directory has nothing to check.
 */
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { cardProblems, indexProblems, logProblems, wikiPageProblems } from "./lib/knowledge.mjs";

/** @param {string} dir @returns {Promise<string[]>} the .md file names in dir, sorted */
async function markdownIn(dir) {
  if (!existsSync(dir)) return [];
  return (await readdir(dir)).filter((name) => name.endsWith(".md")).sort();
}

export default async function parity({ root, config }) {
  const knowledge = path.join(root, "knowledge");
  if (!existsSync(knowledge)) return [];
  const problems = [];

  const cardFiles = await markdownIn(path.join(knowledge, "raw"));
  const wikiFiles = await markdownIn(path.join(knowledge, "wiki"));
  const cards = new Set(cardFiles.map((name) => `raw/${name}`));

  for (const name of cardFiles) {
    const rel = `knowledge/raw/${name}`;
    problems.push(...cardProblems(rel, await readFile(path.join(root, rel), "utf8")));
  }
  const published = new Set((config.pages ?? []).map((page) => page.src));
  for (const name of wikiFiles) {
    const rel = `knowledge/wiki/${name}`;
    problems.push(...wikiPageProblems(rel, await readFile(path.join(root, rel), "utf8"), cards));
    if (!published.has(rel)) problems.push(`${rel}: not in "pages" of docs.config.mjs, so it is not on the site`);
  }

  for (const rel of ["knowledge/README.md", "knowledge/log.md", "knowledge/CLAUDE.md"]) {
    if (!existsSync(path.join(root, rel))) problems.push(`${rel}: missing`);
  }
  if (existsSync(path.join(knowledge, "README.md"))) {
    problems.push(...indexProblems(await readFile(path.join(knowledge, "README.md"), "utf8"), wikiFiles));
  }
  if (existsSync(path.join(knowledge, "log.md"))) {
    problems.push(...logProblems(await readFile(path.join(knowledge, "log.md"), "utf8")));
  }
  return problems;
}
