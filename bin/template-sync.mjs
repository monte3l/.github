#!/usr/bin/env node
// SPDX-FileCopyrightText: Copyright (c) 2026 Enrico Lionello (enri3l) and Giulia Montevecchi (giulmonte), monte3l
// SPDX-License-Identifier: MIT

/**
 * Compares every consumer repository's copy of each workflow template, and of each
 * verbatim starter in `blueprint/files/` that `sync.json` lists, with the original,
 * and says which copies are current, which are stale and which a person has
 * changed.
 *
 *   node bin/template-sync.mjs [--repos a,b] [--owner OWNER] [--json] [--check] [--findings FILE]
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
 * Prints a table (`I` identical, `E` equivalent, `S1` stale by one version, `C`
 * custom, `-` the repository has no such file), then the counts for the managed
 * templates and the findings.
 *
 * Findings are what a person should look at: a managed copy that is stale, and a
 * repository whose flag in `sync.json` disagrees with its own `docs.config.mjs`.
 * With --findings, they are also written to FILE, which is empty when there are
 * none. With --check the exit code is 1 when there are any. With --json the
 * output is `{ results, mismatches }`.
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
import { classify, describeStale, jobNames, render, unitsFor } from "./lib/template-sync.mjs";

const root = path.resolve(import.meta.dirname, "..");
const NAME_RE = /^[A-Za-z0-9._][A-Za-z0-9._-]*$/;
const fail = (code, message) => {
  console.error(`template-sync: ${message}`);
  process.exit(code);
};
const USAGE = "usage: node bin/template-sync.mjs [--repos a,b] [--owner OWNER] [--json] [--check] [--findings FILE]\n       node bin/template-sync.mjs --repos NAME --write DIR";

let owner = "monte3l";
let only = null;
let asJson = false;
let check = false;
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
  else if (args[i] === "--owner") owner = value(i++);
  else if (args[i] === "--repos") only = value(i++).split(",");
  else if (args[i] === "--findings") findingsFile = value(i++);
  else if (args[i] === "--write") writeDir = value(i++);
  else fail(2, `cannot use "${args[i]}"\n${USAGE}`);
}
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
    if (missing(error)) fail(3, `${owner}/${repo} does not exist, or this token cannot see it`);
    throw error;
  }
  if (info.private) fail(3, `${owner}/${repo} is private, and this token reads public repositories only`);
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
    for (const unit of unitsFor(config, repo)) {
      const found = fetchFirst(repo, unit.paths);
      const row = { repo, template: unit.name, kind: unit.kind, managed: unit.managed };
      if (found === null) {
        results.push({ ...row, path: unit.paths[0], state: "MISSING" });
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
      let verdict = classify(found.text, current, old);
      // A starter has no SPDX header and the comparison ignores that line, so a copy that carries its
      // own would be refreshed without it, which can fail a REUSE check there. A person does that one.
      if (unit.kind === "starter" && verdict.state === "STALE" && /SPDX-/.test(found.text) && !/SPDX-/.test(current)) verdict = { state: "CUSTOM" };
      results.push({ ...row, path: found.path, ...verdict });
      if (writeDir !== null && unit.managed && verdict.state === "STALE") {
        // Only a workflow has jobs: a starter has no required check to rename.
        if (unit.kind === "workflow" && jobNames(found.text).join("\n") !== jobNames(current).join("\n")) {
          console.error(`template-sync: left out ${repo} ${unit.name}.yml: the refresh would change its job names, which a required check depends on. A person does this one`);
          continue;
        }
        const target = path.join(writeDir, found.path);
        mkdirSync(path.dirname(target), { recursive: true });
        writeFileSync(target, current.endsWith("\n") ? current : `${current}\n`);
      }
    }
  }
} catch (error) {
  fail(3, `a read failed: ${String(error.stderr ?? error.message).trim().split("\n")[0]}`);
}

const stale = results.filter((r) => r.managed && r.state === "STALE");
const findings = [
  ...stale.map(describeStale),
  ...mismatches,
];
if (findingsFile) writeFileSync(findingsFile, findings.length === 0 ? "" : `${findings.join("\n")}\n`);

if (asJson) {
  console.log(JSON.stringify({ results, mismatches }, null, 2));
} else {
  const cell = (r) => (r.state === "MISSING" ? "-" : r.state === "STALE" ? `S${r.back}` : r.state[0]) + (r.managed ? "" : "*");
  console.log(`${"template".padEnd(20)}${repos.map((r) => r.replace("m3l-", "").slice(0, 11).padEnd(12)).join("")}`);
  for (const unit of unitsFor(config, repos[0])) {
    console.log(unit.name.padEnd(20) + repos.map((repo) => cell(results.find((r) => r.repo === repo && r.template === unit.name)).padEnd(12)).join(""));
  }
  console.log("\n* = unmanaged: shown for information, never changed by a sync");
  const count = (rows) => {
    const tally = {};
    for (const r of rows) tally[r.state] = (tally[r.state] ?? 0) + 1;
    return Object.entries(tally).map(([state, n]) => `${state} ${n}`).join(", ");
  };
  console.log(`\nmanaged copies: ${count(results.filter((r) => r.managed && r.state !== "MISSING"))}`);
  console.log(`unmanaged copies: ${count(results.filter((r) => !r.managed && r.state !== "MISSING"))}`);
  if (findings.length > 0) console.log(`\nfindings:\n${findings.map((line) => `  ${line}`).join("\n")}`);
}
process.exitCode = check && findings.length > 0 ? 1 : 0;
