#!/usr/bin/env node
// SPDX-FileCopyrightText: Copyright (c) 2026 Enrico Lionello (enri3l) and Giulia Montevecchi (giulmonte), monte3l
// SPDX-License-Identifier: MIT

/**
 * Compares every consumer repository's copy of each workflow template, and of each
 * verbatim starter in `blueprint/files/` that `sync.json` lists, with the original,
 * and says which copies are current, which are stale and which a person has
 * changed.
 *
 *   node bin/template-sync.mjs [--repos a,b] [--owner OWNER] [--json] [--check] [--public] [--findings FILE]
 *   node bin/template-sync.mjs --repos NAME --write DIR
 *
 * READ-ONLY toward every repository: it reads files through `gh api` and the
 * template's git history. With --write it also writes, into the local directory
 * DIR only, the current template for each STALE managed copy of that one
 * repository, at the path the repository keeps it at (`DIR/.github/workflows/NAME.yml`,
 * `DIR/.gitleaks.toml`, ...). Nothing else is written and nothing is sent:
 * `bin/template-sync-pr.sh` commits what is there, and only at a path `sync.json` names.
 * The file is the template with its action pins, not the repository's: a pin can
 * be tied to an input in the same file (zizmor-action and its `version:`), so a
 * refreshed file keeps the pins it was written with. The comparison still ignores
 * pins, which is why a pin alone never makes a copy stale.
 * A copy is left out, and said so on stderr, when the refresh would change the
 * set of job names, because a required check is a job name. The rules of the comparison are in
 * `bin/lib/template-sync.mjs`, and the data (which templates and starters are managed,
 * which repositories take which optional blocks) is `blueprint/sync.json`.
 *
 * A repository may keep extra verbatim copies of a starter (`repos.<name>.twins` in sync.json). Each is a row of its
 * own, `STARTER+1`, compared and refreshed like the main copy.
 *
 * Prints a table (`I` identical, `E` equivalent, `S1` stale by one version, `H1` stale
 * but held back because a starter it needs is custom or missing, `C` custom, `skip` left out
 * by the repository's `skip` list in sync.json, `-` the repository has no such file), then
 * the counts for the managed templates and the findings.
 *
 * Findings are what a person should look at: a managed copy that is stale, and a
 * repository whose flag in `sync.json` disagrees with its own `docs.config.mjs`.
 * With --findings, they are also written to FILE, which is empty when there are
 * none. With --check the exit code is 1 when there are any. With --json the
 * output is `{ results, mismatches }`.
 *
 * With --public the output is safe to publish from the public repository: no table,
 * no finding line and nothing else that names a repository. It prints and writes
 * counts only (how many copies are behind, in how many repositories, how many are held
 * back, how many flags disagree). `freshness.yml` uses it, because its issue, its job
 * summary and its logs are readable by anyone. It cannot be combined with --json or
 * --write, which carry names.
 *
 * It must not be able to report "nothing found" by failing quietly, because a
 * workflow closes its tracking issue on that. So it stops with exit 3 when a
 * repository cannot be read in full (private, renamed, missing) and with exit 2
 * when the template history is not there (a shallow clone: use `fetch-depth: 0`).
 *
 * Exit codes: 0 done (or no findings with --check), 1 findings (--check),
 * 2 usage, a missing tool or a shallow clone, 3 a read failed.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { classify, describeHeld, describeStale, holdUncoupled, jobNames, keepHeader, render, unitsFor } from "./lib/template-sync.mjs";

const root = path.resolve(import.meta.dirname, "..");
const NAME_RE = /^[A-Za-z0-9._][A-Za-z0-9._-]*$/;
const fail = (code, message) => {
  console.error(`template-sync: ${message}`);
  process.exit(code);
};
const USAGE = "usage: node bin/template-sync.mjs [--repos a,b] [--owner OWNER] [--json] [--check] [--public] [--findings FILE]\n       node bin/template-sync.mjs --repos NAME --write DIR";

let owner = "monte3l";
let only = null;
let asJson = false;
let check = false;
let publicOutput = false;
let findingsFile = null;
let writeDir = null;
const args = process.argv.slice(2);
const value = (i) => {
  const next = args[i + 1];
  if (next === undefined || next.startsWith("-")) fail(2, `${args[i]} needs a value\n${USAGE}`);
  return next;
};
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--json") asJson = true;
  else if (args[i] === "--check") check = true;
  else if (args[i] === "--public") publicOutput = true;
  else if (args[i] === "--owner") owner = value(i++);
  else if (args[i] === "--repos") only = value(i++).split(",");
  else if (args[i] === "--findings") findingsFile = value(i++);
  else if (args[i] === "--write") writeDir = value(i++);
  else fail(2, `cannot use "${args[i]}"\n${USAGE}`);
}
if (publicOutput && (asJson || writeDir !== null)) fail(2, `--public prints counts only, so it cannot be combined with --json or --write\n${USAGE}`);
if (writeDir !== null && (only === null || only.length !== 1)) fail(2, `--write needs --repos with exactly one repository\n${USAGE}`);
for (const name of [owner, ...(only ?? [])]) if (!NAME_RE.test(name)) fail(2, `not an owner or repository name: ${name}`);

const run = (cmd, argv) => execFileSync(cmd, argv, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 16 * 1024 * 1024 });
try {
  run("gh", ["--version"]);
  run("git", ["--version"]);
} catch {
  fail(2, "gh and git are required");
}
if (run("git", ["rev-parse", "--is-shallow-repository"]).trim() === "true") {
  fail(2, "this is a shallow clone, so the templates' history is missing and no copy could be stale. Check out with fetch-depth: 0");
}

const readJson = (rel) => JSON.parse(readFileSync(path.join(root, rel), "utf8"));
const config = readJson("blueprint/sync.json");
const sites = Object.fromEntries(readJson("blueprint/projects.json").map((p) => [p.repo, p.site]));
const templateNames = readdirSync(path.join(root, "workflow-templates"))
  .filter((name) => name.endsWith(".yml"))
  .map((name) => name.slice(0, -".yml".length))
  .sort();
for (const name of templateNames) if (!(name in config.templates)) fail(2, `blueprint/sync.json does not list the template "${name}"`);
for (const name of Object.keys(config.templates)) if (!templateNames.includes(name)) fail(2, `blueprint/sync.json lists "${name}", which is not a template`);
for (const name of Object.keys(config.repos)) if (!NAME_RE.test(name)) fail(2, `blueprint/sync.json has the repository name "${name}", which is not a valid name`);
const starterNames = Object.keys(config.starters ?? {}).sort();
for (const name of starterNames) {
  if (!existsSync(path.join(root, "blueprint", "files", name))) fail(2, `blueprint/sync.json lists the starter "${name}", which is not in blueprint/files/`);
}
// A path is written into a checkout and sent to a repository: it must stay inside it.
const safePath = (p) => typeof p === "string" && p !== "" && !p.startsWith("/") && !p.split("/").includes("..");
for (const [name, entry] of Object.entries(config.starters ?? {})) {
  for (const p of entry.paths ?? []) if (!safePath(p)) fail(2, `blueprint/sync.json: the starter "${name}" has the path "${p}", which is not a relative path inside the repository`);
}
for (const [repo, entry] of Object.entries(config.repos)) {
  for (const [name, p] of Object.entries(entry.paths ?? {})) if (!safePath(p)) fail(2, `blueprint/sync.json: ${repo} has the path "${p}" for "${name}", which is not a relative path inside the repository`);
  for (const [name, list] of Object.entries(entry.twins ?? {})) {
    if (!(name in (config.starters ?? {}))) fail(2, `blueprint/sync.json: ${repo} has twins of "${name}", which is not a starter`);
    for (const p of Array.isArray(list) ? list : []) if (!safePath(p)) fail(2, `blueprint/sync.json: ${repo} has the twin path "${p}" for "${name}", which is not a relative path inside the repository`);
  }
}
for (const name of only ?? []) if (!(name in config.repos)) fail(2, `${name} is not a consumer in blueprint/sync.json`);

// Every version a source file has had, newest first (the working tree is the current one).
function versionsOf(file) {
  const current = readFileSync(path.join(root, file), "utf8");
  const commits = run("git", ["log", "--follow", "--format=%H", "--", file]).split("\n").filter(Boolean);
  const old = [];
  for (const commit of commits) {
    let text;
    try {
      text = run("git", ["show", `${commit}:${file}`]);
    } catch {
      continue; // the file lived at another path then: that version is skipped, so a copy of it reads as custom, the safe way
    }
    if (text !== current && !old.includes(text)) old.push(text);
  }
  return { current, old };
}
const sources = [...templateNames.map((name) => `workflow-templates/${name}.yml`), ...starterNames.map((name) => `blueprint/files/${name}`)];
const versions = Object.fromEntries(sources.map((file) => [file, versionsOf(file)]));

const missing = (error) => /HTTP 404/.test(String(error.stderr ?? error.message));
const text = (encoded) => Buffer.from(encoded.trim(), "base64").toString("utf8");

/** A file's text, or null when the repository has no such file. */
function fetchFile(repo, file) {
  try {
    return text(run("gh", ["api", `repos/${owner}/${repo}/contents/${file}`, "--jq", ".content"]));
  } catch (error) {
    if (missing(error)) return null;
    throw error;
  }
}

/** The first of `paths` the repository has, as `{ path, text }`, or null. */
function fetchFirst(repo, paths) {
  for (const candidate of paths) {
    const found = fetchFile(repo, candidate);
    if (found !== null) return { path: candidate, text: found };
  }
  return null;
}

/** A repository this token cannot read in full is an error, not "no files". */
function assertReadable(repo) {
  let info;
  try {
    info = JSON.parse(run("gh", ["api", `repos/${owner}/${repo}`, "--jq", "{private, archived}"]));
  } catch (error) {
    if (missing(error)) fail(3, `${publicOutput ? "a repository" : `${owner}/${repo}`} does not exist, or this token cannot see it`);
    throw error;
  }
  if (info.private) fail(3, `${publicOutput ? "a repository" : `${owner}/${repo}`} is private, and this token reads public repositories only`);
}

const repos = Object.keys(config.repos).filter((name) => only === null || only.includes(name)).sort();
if (repos.length === 0) fail(2, "no repository to look at");

const results = [];
const mismatches = [];
try {
  for (const repo of repos) {
    assertReadable(repo);
    const flags = config.repos[repo].flags ?? [];
    const params = { site: sites[repo], flags };
    // A flag has to say what the repository really has, or its copies are rendered wrongly.
    if (flags.includes("manifest") || config.flags?.manifest) {
      const docsConfig = fetchFile(repo, "docs.config.mjs");
      const hasManifest = docsConfig !== null && /^\s*manifest\s*:/m.test(docsConfig);
      if (flags.includes("manifest") !== hasManifest) {
        mismatches.push(`${repo}: ${flags.includes("manifest") ? 'sets the flag "manifest" but its docs.config.mjs has none' : 'has a manifest in docs.config.mjs but no "manifest" flag'}`);
      }
    }
    const rows = [];
    const copies = new Map();
    for (const unit of unitsFor(config, repo)) {
      // A twin names the units it needs itself, since its own name is not a starter's.
      const row = { repo, template: unit.name, kind: unit.kind, managed: unit.managed, ...(unit.twinOf ? { requires: unit.requires } : {}) };
      // A repository that keeps its own version on purpose says so in sync.json: nothing is read or written.
      if (unit.skipped) {
        rows.push({ ...row, path: unit.paths[0], state: "SKIPPED" });
        continue;
      }
      const found = fetchFirst(repo, unit.paths);
      if (found === null) {
        rows.push({ ...row, path: unit.paths[0], state: "MISSING" });
        continue;
      }
      let current;
      try {
        current = render(versions[unit.source].current, params);
      } catch (error) {
        fail(3, `${unit.source}: ${error.message}`);
      }
      const old = [];
      for (const version of versions[unit.source].old) {
        try {
          old.push(render(version, params));
        } catch {
          // An older version with broken markers cannot be rendered, so nothing is called stale against it.
        }
      }
      const verdict = classify(found.text, current, old);
      rows.push({ ...row, path: found.path, ...verdict });
      copies.set(unit.name, { unit, found, current });
    }
    // A starter that needs another (the push guard and its helper) is refreshed only beside a usable one.
    for (const row of holdUncoupled(rows, config)) {
      results.push(row);
      const copy = copies.get(row.template);
      if (writeDir !== null && copy && row.managed && row.state === "STALE") {
        const { unit, found, current } = copy;
        // Only a workflow has jobs: a starter has no required check to rename.
        if (unit.kind === "workflow" && jobNames(found.text).join("\n") !== jobNames(current).join("\n")) {
          console.error(`template-sync: left out ${repo} ${unit.name}.yml: the refresh would change its job names, which a required check depends on. A person does this one`);
          continue;
        }
        const target = path.join(writeDir, found.path);
        mkdirSync(path.dirname(target), { recursive: true });
        // The comparison ignores the SPDX header, so the refresh must leave the repository's own alone: a
        // repository that checks its licence headers inline fails on a workflow that lost them.
        const refreshed = keepHeader(current, found.text);
        writeFileSync(target, refreshed.endsWith("\n") ? refreshed : `${refreshed}\n`);
      }
    }
  }
} catch (error) {
  // The message of a failed `gh` call usually holds the repository's path, so a public run leaves it out.
  fail(3, publicOutput ? "a read failed (run without --public for the detail)" : `a read failed: ${String(error.stderr ?? error.message).trim().split("\n")[0]}`);
}

const stale = results.filter((r) => r.managed && r.state === "STALE");
const held = results.filter((r) => r.managed && r.state === "HELD");
const findings = [
  ...stale.map(describeStale),
  ...held.map(describeHeld),
  ...mismatches,
];

// Counts only, for a public place: how many, never which repository or file.
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const publicSummary = () => {
  const behind = stale.length + held.length;
  const lines = [];
  if (behind > 0) {
    const inRepos = new Set([...stale, ...held].map((r) => r.repo)).size;
    lines.push(`${plural(behind, "copy is", "copies are")} behind ${behind === 1 ? "its" : "their"} template or starter, in ${plural(inRepos, "repository", "repositories")}.`);
  }
  if (held.length > 0) lines.push(`${plural(held.length, "of them is", "of them are")} held back until a helper ${held.length === 1 ? "it needs is" : "they need are"} refreshed.`);
  if (mismatches.length > 0) lines.push(`${plural(mismatches.length, "repository has", "repositories have")} a flag that disagrees with its docs.config.mjs.`);
  return lines;
};
if (findingsFile) {
  const lines = publicOutput ? publicSummary() : findings;
  writeFileSync(findingsFile, lines.length === 0 ? "" : `${lines.join("\n")}\n`);
}

const countOf = (rows) => {
  const tally = {};
  for (const r of rows) tally[r.state] = (tally[r.state] ?? 0) + 1;
  return Object.entries(tally).map(([state, n]) => `${state} ${n}`).join(", ");
};
if (publicOutput) {
  console.log(`managed copies: ${countOf(results.filter((r) => r.managed && r.state !== "MISSING"))}`);
  console.log(`unmanaged copies: ${countOf(results.filter((r) => !r.managed && r.state !== "MISSING"))}`);
  const summary = publicSummary();
  console.log(summary.length === 0 ? "\nfindings: none" : `\nfindings:\n${summary.map((line) => `  ${line}`).join("\n")}`);
} else if (asJson) {
  console.log(JSON.stringify({ results, mismatches }, null, 2));
} else {
  // A repository may have units the others do not (its twins of a starter), so the rows are the union.
  const cell = (r) => (r === undefined || r.state === "MISSING" ? "-" : r.state === "SKIPPED" ? "skip" : r.state === "STALE" ? `S${r.back}` : r.state === "HELD" ? `H${r.back}` : r.state[0]) + (r !== undefined && !r.managed ? "*" : "");
  const unitNames = [...new Set(repos.flatMap((repo) => unitsFor(config, repo).map((unit) => unit.name)))];
  const width = Math.max(20, ...unitNames.map((name) => name.length + 2));
  console.log(`${"template".padEnd(width)}${repos.map((r) => r.replace("m3l-", "").slice(0, 11).padEnd(12)).join("")}`);
  for (const name of unitNames) {
    console.log(name.padEnd(width) + repos.map((repo) => cell(results.find((r) => r.repo === repo && r.template === name)).padEnd(12)).join(""));
  }
  console.log("\n* = unmanaged: shown for information, never changed by a sync");
  console.log(`\nmanaged copies: ${countOf(results.filter((r) => r.managed && r.state !== "MISSING"))}`);
  console.log(`unmanaged copies: ${countOf(results.filter((r) => !r.managed && r.state !== "MISSING"))}`);
  if (findings.length > 0) console.log(`\nfindings:\n${findings.map((line) => `  ${line}`).join("\n")}`);
}
process.exitCode = check && findings.length > 0 ? 1 : 0;
