#!/usr/bin/env node
// SPDX-FileCopyrightText: Copyright (c) 2026 Enrico Lionello (enri3l) and Giulia Montevecchi (giulmonte), monte3l
// SPDX-License-Identifier: MIT

/**
 * Applies a person's decisions on conflicts between a project's
 * `.bestpractices.json` and its bestpractices.dev answers.
 *
 *   node bin/bestpractices-settle.mjs DECISIONS-FILE [--repos a,b] [--owner OWNER]
 *   node bin/bestpractices-settle.mjs DECISIONS-FILE --repos NAME --write DIR
 *
 * The sync job never settles a conflict: both sides moved and differ, so which
 * wording is right is a person's call. This is where that call is carried out.
 * DECISIONS-FILE is JSON kept OUTSIDE every repository, because it names which
 * projects differ on which criteria and this repository is public:
 *
 *   { "m3l-design": { "interact": "file", "repo_track": "site" } }
 *
 * "file" keeps the file's wording. bestpractices.dev only saves an answer when a
 * logged-in person submits its form, so this prints a link per section that
 * opens the form with exactly those answers filled in: open it and click Save.
 * "site" keeps the site's wording and writes it into the file. With --write DIR
 * (one repository) it writes the file into the checkout at DIR, and you review,
 * commit with `git commit -s` and open the pull request as for any change.
 *
 * When neither wording is right, a decision can carry its own:
 *
 *   { "m3l-design": { "osps_br_07_01": { "status": "Met", "justification": "..." } } }
 *
 * That answer goes to both places at once: into the file (with --write, as for
 * "site") and into a Save link for the site (as for "file"), so the two end up
 * the same. The status must be Met, Unmet or N/A, and N/A only where the
 * criterion allows it.
 *
 * Custom wording may also amend a criterion that is not a conflict, where the
 * file and the site agree: the sync compares the two sides and never questions
 * an answer both of them state, so an answer that is wrong on both (a license
 * claim a release check shows to be false, say) is fixed here. "file" and
 * "site" mean nothing there. A criterion with a change waiting on one side, or
 * one that already has the answer on both sides, is skipped and reported.
 *
 * Each decision is checked against the state it finds now. A criterion that is
 * no longer a conflict (a side moved since the choice was made) is skipped and
 * reported, never applied, so a stale choice cannot overwrite a newer answer.
 * A conflict with no decision stays a conflict. Once the two sides match, the
 * next run of `bestpractices-sync.yml` records the agreement and closes it.
 *
 * It prints project and criterion names, so it refuses to run in a workflow
 * (GITHUB_ACTIONS=true): that log is public.
 *
 * Exit codes: 0 done, 1 a decision was skipped, 2 usage, 3 a project could not
 * be checked or a call failed.
 */

import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { baseUrl, inspect, loadCriteria, writeInto } from "./bestpractices-sync.mjs";
import { applyDecisions } from "./lib/bestpractices.mjs";

const USAGE = `usage: node bin/bestpractices-settle.mjs DECISIONS-FILE [--repos a,b] [--owner OWNER]
       node bin/bestpractices-settle.mjs DECISIONS-FILE --repos NAME --write DIR`;

class UsageError extends Error {}

function parseArgs(argv) {
  const opts = { file: null, owner: "monte3l", repos: null, write: null };
  const value = (i) => {
    if (i + 1 >= argv.length) throw new UsageError(`${argv[i]} needs a value`);
    return argv[i + 1];
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--owner") opts.owner = value(i++);
    else if (a === "--repos") opts.repos = value(i++).split(",").filter(Boolean);
    else if (a === "--write") opts.write = value(i++);
    else if (a.startsWith("--")) throw new UsageError(`unknown argument ${a}`);
    else if (opts.file === null) opts.file = a;
    else throw new UsageError("only one decisions file");
  }
  if (opts.file === null) throw new UsageError("a decisions file is needed");
  if (!/^[A-Za-z0-9._-]+$/.test(opts.owner)) throw new UsageError("invalid owner");
  for (const name of opts.repos ?? []) if (!/^[A-Za-z0-9._-]+$/.test(name)) throw new UsageError(`invalid repository name ${name}`);
  return opts;
}

/**
 * Repository -> Map criterion -> "file" | "site" | { status, justification }. Keys starting with an
 * underscore are comments.
 */
function readDecisions(file) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    throw new UsageError("the decisions file cannot be read as JSON");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new UsageError("the decisions file must be a JSON object of repositories");
  const out = new Map();
  for (const [repo, byCriterion] of Object.entries(parsed)) {
    if (repo.startsWith("_")) continue;
    if (!/^[A-Za-z0-9._-]+$/.test(repo)) throw new UsageError(`invalid repository name ${repo}`);
    if (byCriterion === null || typeof byCriterion !== "object" || Array.isArray(byCriterion)) throw new UsageError(`${repo}: decisions must be an object of criterion to "file", "site" or custom wording`);
    const decisions = new Map();
    for (const [name, choice] of Object.entries(byCriterion)) {
      if (name.startsWith("_")) continue;
      const isCustom = choice !== null && typeof choice === "object" && !Array.isArray(choice) && typeof choice.status === "string" && typeof choice.justification === "string";
      if (choice !== "file" && choice !== "site" && !isCustom) {
        throw new UsageError(`${repo}: ${name} must be "file", "site" or an object with a status and a justification text, not ${JSON.stringify(choice)}`);
      }
      decisions.set(name, choice);
    }
    out.set(repo, decisions);
  }
  return out;
}

// What a justification says is typed by whoever can edit the project on the site or in the repository, and
// it is printed to a terminal. A control character could carry an escape sequence that rewrites what the
// screen shows, and a bidirectional override reorders how text is displayed, so both are removed from
// everything this prints.
const clean = (text) => String(text).replace(/[\p{Cc}\p{Cf}]/gu, "");

const clip = (text, n = 150) => (text.length > n ? `${text.slice(0, n - 1)}…` : text);
const show = (answer) => (!answer ? "unset" : clip(answer.justification === "" ? answer.status : `${answer.status}: ${answer.justification.replace(/\s+/g, " ")}`));

export async function main(argv, out = (line) => process.stdout.write(`${clean(line)}\n`)) {
  if (process.env.GITHUB_ACTIONS === "true") {
    throw new UsageError("this prints project and criterion names, so it runs by hand, not in a workflow");
  }
  const opts = parseArgs(argv);
  const all = readDecisions(opts.file);
  const repos = opts.repos ?? [...all.keys()];
  for (const name of repos) if (!all.has(name)) throw new UsageError(`${name} has no decisions in the file`);
  if (opts.write !== null && repos.length !== 1) throw new UsageError("--write needs exactly one repository");

  const criteria = loadCriteria();
  let skipped = 0;
  let failed = 0;
  for (const name of repos) {
    const state = await inspect(opts.owner, name, criteria);
    if (state.state === "error" || state.state === "not-registered") {
      failed += 1;
      out(`${name}: cannot settle, ${state.error ?? state.state}${state.detail ? ` (${state.detail})` : ""}`);
      continue;
    }
    const done = applyDecisions(all.get(name), state, criteria, baseUrl(), state.id);
    const open = new Set(state.conflicts);
    const decided = [...done.keepFile, ...done.keepSite, ...done.custom.keys()].filter((c) => open.has(c)).length;
    const amended = [...done.custom.keys()].filter((c) => !open.has(c)).length;
    out(`${name} (project ${state.id}): ${state.conflicts.length} conflicts now, ${decided} decided, ${state.conflicts.length - decided} left${amended > 0 ? `, ${amended} agreed answer${amended === 1 ? "" : "s"} amended` : ""}`);

    if (done.keepFile.length > 0) {
      out(`  keep the file's wording (${done.keepFile.length}):`);
      for (const c of done.keepFile) {
        out(`    ${c}`);
        out(`      site: ${show(state.site.get(c))}`);
        out(`      file: ${show(state.file.get(c))}`);
      }
    }
    if (done.keepSite.length > 0) {
      out(`  keep the site's wording (${done.keepSite.length}):`);
      for (const c of done.keepSite) {
        out(`    ${c}`);
        out(`      site: ${show(state.site.get(c))}`);
        out(`      file: ${show(state.file.get(c))}`);
      }
    }
    if (done.custom.size > 0) {
      out(`  custom wording (${done.custom.size}): goes to the file and to a Save link, so both match:`);
      for (const [c, answer] of done.custom) {
        out(`    ${c}`);
        out(`      site: ${show(state.site.get(c))}`);
        out(`      file: ${show(state.file.get(c))}`);
        out(`      new:  ${show(answer)}`);
      }
    }
    // One Save link set covers the file's wording and the custom wording together: both are an answer to put on the site.
    if (done.proposals.urls.length > 0 || done.proposals.oversize.length > 0) {
      out("  Save links: log in to bestpractices.dev, open each, check the answers, click Save:");
      for (const { section, count, url } of done.proposals.urls) {
        out(`    ${section}: ${count} answer${count === 1 ? "" : "s"}`);
        out(`      ${url}`);
      }
      for (const c of done.proposals.oversize) out(`    ${c}: too long for a link, paste it from the file into the form by hand`);
    }
    // One file write covers the site's wording and the custom wording together: both are an answer to put in the file.
    if (done.fileText !== null) {
      if (opts.write !== null) {
        writeInto(opts.write, state.filePath, done.fileText);
        out(`  wrote ${state.filePath} into ${opts.write}. Review the diff, commit with \`git commit -s\` and open a pull request.`);
      } else {
        out("  nothing written: add --write DIR (a checkout of the repository) to write the file.");
      }
    }
    for (const { name: c, why } of done.skipped) {
      skipped += 1;
      out(`  skipped ${c}: ${why}`);
    }
  }
  process.exitCode = failed > 0 ? 3 : skipped > 0 ? 1 : 0;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    if (error instanceof UsageError) {
      process.stderr.write(`${error.message}\n${USAGE}\n`);
      process.exit(2);
    }
    process.stderr.write(`${error?.code === 3 || error?.message ? error.message : "unexpected failure"}\n`);
    process.exit(3);
  });
}
