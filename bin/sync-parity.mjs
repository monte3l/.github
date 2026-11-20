// SPDX-FileCopyrightText: Copyright (c) 2026 Enrico Lionello (enri3l) and Giulia Montevecchi (giulmonte), monte3l
// SPDX-License-Identifier: MIT

/**
 * Parity for `blueprint/sync.json`, run by the docs kit's `--check` (listed in
 * `docs.config.mjs` `parity`). It fails when the file stops matching what it
 * describes: a workflow template it does not list, or lists but does not exist;
 * a mode that is not `managed` or `unmanaged`; a repository that is not in
 * `blueprint/projects.json`; a flag nobody declared; a `sync:if` block in a
 * template that is not closed, or names an undeclared flag; or, for a starter, a
 * file that is not in `blueprint/files/`, a path that could leave the repository,
 * or a first path that is not where `bootstrap.json` writes it.
 *
 * The template sync reads this file to decide what it may touch, so a typo here
 * would quietly widen or narrow that.
 */
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const MODES = new Set(["managed", "unmanaged"]);

/**
 * @param {string} name a template's file name, for messages
 * @param {string} text the template
 * @param {Set<string>} flags the declared flags
 * @returns {string[]}
 */
export function markerProblems(name, text, flags) {
  const problems = [];
  let open = null;
  text.split("\n").forEach((line, index) => {
    const start = /^\s*#\s*sync:if\s+(\S+)\s*$/.exec(line);
    const end = /^\s*#\s*sync:end\s*$/.test(line);
    const where = `workflow-templates/${name}:${index + 1}`;
    if (!start && !end && /^\s*#\s*sync:/.test(line)) {
      // Anything that looks like a marker but is not exactly one would be ignored, and its block kept in every repository.
      problems.push(`${where}: "${line.trim()}" looks like a sync marker but is not exactly "# sync:if FLAG" or "# sync:end"`);
    } else if (start) {
      if (open !== null) problems.push(`${where}: a sync:if block opens inside the one opened at line ${open}`);
      if (!flags.has(start[1])) problems.push(`${where}: the flag "${start[1]}" is not declared in blueprint/sync.json`);
      open = index + 1;
    } else if (end) {
      if (open === null) problems.push(`${where}: sync:end with no sync:if`);
      open = null;
    }
  });
  if (open !== null) problems.push(`workflow-templates/${name}:${open}: sync:if is never closed by sync:end`);
  return problems;
}

/**
 * A path the sync may write into a repository and send to GitHub.
 *
 * @param {string} where for messages
 * @param {unknown} value
 * @returns {string[]}
 */
export function pathProblems(where, value) {
  if (typeof value !== "string" || value === "") return [`${where} has a path that is not a non-empty string`];
  const problems = [];
  if (value.startsWith("/")) problems.push(`${where} has the absolute path "${value}"`);
  if (value.split("/").includes("..")) problems.push(`${where} has the path "${value}", which leaves the repository`);
  if (value.split("/")[0] === ".git") problems.push(`${where} has the path "${value}", which is inside .git`);
  if (/[\\*?[\]]/.test(value)) problems.push(`${where} has the path "${value}", which holds a glob or backslash character`);
  return problems;
}

export default async function parity({ root }) {
  const read = (rel) => readFile(path.join(root, rel), "utf8");
  const config = JSON.parse(await read("blueprint/sync.json"));
  const projects = new Set(JSON.parse(await read("blueprint/projects.json")).map((p) => p.repo));
  const templates = (await readdir(path.join(root, "workflow-templates")))
    .filter((name) => name.endsWith(".yml"))
    .map((name) => name.slice(0, -".yml".length));
  const flags = new Set(Object.keys(config.flags ?? {}));
  const problems = [];

  for (const name of templates) {
    if (!(name in config.templates)) problems.push(`blueprint/sync.json: the template "${name}" is not listed under "templates"`);
    problems.push(...markerProblems(`${name}.yml`, await read(`workflow-templates/${name}.yml`), flags));
  }
  for (const [name, mode] of Object.entries(config.templates)) {
    if (!templates.includes(name)) problems.push(`blueprint/sync.json: "templates" lists "${name}", which is not a workflow template`);
    if (!MODES.has(mode)) problems.push(`blueprint/sync.json: "${name}" has the mode "${mode}", which is neither managed nor unmanaged`);
  }
  const starters = config.starters ?? {};
  // Read only when there is a starter, so a tree without any does not need the file.
  const bootstrap = Object.keys(starters).length === 0 ? null : JSON.parse(await read("blueprint/bootstrap.json"));
  const bootstrapped = new Map((bootstrap?.starters ?? []).map((entry) => [entry.from, entry.to]));
  for (const [name, entry] of Object.entries(starters)) {
    const where = `blueprint/sync.json: the starter "${name}"`;
    if (name in config.templates) problems.push(`${where} has the name of a workflow template, so a path override for it would be ambiguous`);
    if (!existsSync(path.join(root, "blueprint", "files", name))) problems.push(`${where} is not in blueprint/files/`);
    if (!MODES.has(entry.mode)) problems.push(`${where} has the mode "${entry.mode}", which is neither managed nor unmanaged`);
    if (!Array.isArray(entry.paths) || entry.paths.length === 0) {
      problems.push(`${where} needs a non-empty "paths" array`);
      continue;
    }
    for (const p of entry.paths) problems.push(...pathProblems(where, p));
    if (new Set(entry.paths).size !== entry.paths.length) problems.push(`${where} lists a path twice`);
    const target = bootstrapped.get(`blueprint/files/${name}`);
    if (target === undefined) problems.push(`${where} is not a starter in blueprint/bootstrap.json, so a new repository would not get it`);
    else if (target !== entry.paths[0]) problems.push(`${where} has "${entry.paths[0]}" as its first path, but bootstrap.json writes it to "${target}"`);
  }
  for (const [repo, entry] of Object.entries(config.repos)) {
    if (!projects.has(repo)) problems.push(`blueprint/sync.json: "repos" lists "${repo}", which is not in blueprint/projects.json`);
    if (repo === ".github") problems.push(`blueprint/sync.json: "repos" lists ".github", whose workflows are its own, not copies`);
    for (const flag of entry.flags ?? []) {
      if (!flags.has(flag)) problems.push(`blueprint/sync.json: ${repo} sets the flag "${flag}", which is not declared`);
    }
    for (const [name, value] of Object.entries(entry.paths ?? {})) {
      if (!(name in config.templates) && !(name in starters)) problems.push(`blueprint/sync.json: ${repo} sets a path for "${name}", which is neither a workflow template nor a starter`);
      problems.push(...pathProblems(`blueprint/sync.json: ${repo}, the path for "${name}",`, value));
    }
  }
  return problems;
}
