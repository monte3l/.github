// SPDX-FileCopyrightText: Copyright (c) 2026 Enrico Lionello (enri3l) and Giulia Montevecchi (giulmonte), monte3l
// SPDX-License-Identifier: MIT

/**
 * Parity for `blueprint/bootstrap.json`, run by the docs kit's `--check` (listed
 * in `docs.config.mjs` `parity`). It fails when the list of what a new
 * repository starts with stops matching what exists: a starter or a workflow
 * template that is neither listed nor excluded with a reason, an entry whose
 * source is missing or is not a file, two entries that write the same path, a
 * path that leaves the repository or lands in `.git`, a condition nobody
 * declared, a key nobody defined (a typo would otherwise turn a conditional
 * entry into an unconditional one), or a placeholder word the source does not
 * contain.
 *
 * `bin/new-repo.sh` reads this file to decide what to write, so a typo here
 * would quietly leave a file out of every new repository. A file that is
 * missing, or in a shape this module does not expect, is a problem it reports,
 * never a crash and never a pass.
 */
import { existsSync, statSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const WHERE = "blueprint/bootstrap.json";
const TOP_KEYS = new Set(["$comment", "kinds", "options", "starters", "templates", "generated", "excluded"]);
const ENTRY_KEYS = {
  starters: new Set(["from", "to", "substitute", "requires", "perKind"]),
  templates: new Set(["name", "requires"]),
  generated: new Set(["to", "what"]),
  excluded: new Set(["from", "reason"]),
};
const WORD_RE = /^[a-z][a-z0-9-]*$/;

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isFile = (file) => existsSync(file) && statSync(file).isFile();

/** @param {string} dir @returns {Promise<string[]>} every file under dir, as paths relative to it (not .DS_Store) */
async function filesUnder(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) found.push(...(await filesUnder(path.join(dir, entry.name))).map((name) => `${entry.name}/${name}`));
    else if (entry.name !== ".DS_Store") found.push(entry.name);
  }
  return found.sort();
}

/** @param {unknown} value @returns {boolean} a relative path that stays inside the repository, and is not in `.git` */
function safePath(value) {
  if (typeof value !== "string" || value === "" || path.isAbsolute(value) || value.includes("\\")) return false;
  const parts = value.split("/");
  return parts.every((part) => part !== ".." && part !== "." && part !== "") && parts[0].toLowerCase() !== ".git";
}

export default async function parity({ root }) {
  const file = path.join(root, WHERE);
  if (!existsSync(file)) return [`${WHERE}: missing, and bin/new-repo.sh reads it`];
  let data;
  try {
    data = JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    return [`${WHERE}: ${error.message}`];
  }
  if (!isObject(data)) return [`${WHERE}: must be an object`];
  const problems = [];
  for (const key of Object.keys(data)) if (!TOP_KEYS.has(key)) problems.push(`${WHERE}: "${key}" is not a key (use ${[...TOP_KEYS].join(", ")})`);

  let sync;
  try {
    sync = JSON.parse(await readFile(path.join(root, "blueprint/sync.json"), "utf8"));
  } catch (error) {
    return [...problems, `blueprint/sync.json: cannot be read, so the templates cannot be checked: ${error.message}`];
  }
  const syncTemplates = isObject(sync) && isObject(sync.templates) ? sync.templates : {};

  const words = (key) => {
    if (!Array.isArray(data[key])) {
      problems.push(`${WHERE}: "${key}" must be an array`);
      return [];
    }
    for (const word of data[key]) if (typeof word !== "string" || !WORD_RE.test(word)) problems.push(`${WHERE}: ${key} has ${JSON.stringify(word)}, which is not a lowercase word`);
    return data[key].filter((word) => typeof word === "string");
  };
  const kinds = words("kinds");
  const options = words("options");
  if (new Set(kinds).size !== kinds.length) problems.push(`${WHERE}: "kinds" lists a kind twice`);
  if (new Set(options).size !== options.length) problems.push(`${WHERE}: "options" lists an option twice`);
  if (options.includes("kind")) problems.push(`${WHERE}: "kind" is not an option: it is what --kind sets`);
  const conditions = new Set(["kind", ...options]);

  /** The entries of one section that are objects with only known keys; the rest are reported. */
  const section = (key) => {
    if (!Array.isArray(data[key])) {
      problems.push(`${WHERE}: "${key}" must be an array`);
      return [];
    }
    const entries = [];
    for (const [i, entry] of data[key].entries()) {
      if (!isObject(entry)) {
        problems.push(`${WHERE}: ${key}[${i}] must be an object`);
        continue;
      }
      for (const name of Object.keys(entry)) if (!ENTRY_KEYS[key].has(name)) problems.push(`${WHERE}: ${key}[${i}] has "${name}", which is not a key (use ${[...ENTRY_KEYS[key]].join(", ")})`);
      entries.push({ entry, by: `${key}[${i}]` });
    }
    return entries;
  };
  const starters = section("starters");
  const templates = section("templates");
  const generated = section("generated");
  const excluded = section("excluded");

  const writes = new Map();
  const claim = (to, by) => {
    if (!safePath(to)) problems.push(`${WHERE}: ${by} writes to ${JSON.stringify(to)}, which is not a relative path inside the repository (and outside .git)`);
    else if (writes.has(to.toLowerCase())) problems.push(`${WHERE}: ${by} and ${writes.get(to.toLowerCase())} both write ${to}`);
    else writes.set(to.toLowerCase(), by);
  };
  const needs = (entry, by) => {
    if (entry.requires !== undefined && !conditions.has(entry.requires)) problems.push(`${WHERE}: ${by} requires ${JSON.stringify(entry.requires)}, which is neither "kind" nor a declared option`);
  };
  /** @returns {boolean} whether the source is a readable file inside the repository */
  const source = (from, by) => {
    if (!safePath(from)) {
      problems.push(`${WHERE}: ${by} reads ${JSON.stringify(from)}, which is not a relative path inside the repository`);
      return false;
    }
    if (!isFile(path.join(root, from))) {
      problems.push(`${WHERE}: ${by} reads ${from}, which is not a file that exists`);
      return false;
    }
    return true;
  };

  const covered = new Set();
  for (const { entry: starter, by } of starters) {
    if (typeof starter.from !== "string" || typeof starter.to !== "string") {
      problems.push(`${WHERE}: ${by} needs "from" and "to"`);
      continue;
    }
    needs(starter, by);
    claim(starter.to, by);
    if (starter.to.toLowerCase().startsWith(".github/workflows/")) problems.push(`${WHERE}: ${by} writes into .github/workflows/, which is for "templates"`);
    if (starter.perKind !== undefined && typeof starter.perKind !== "boolean") problems.push(`${WHERE}: ${by} "perKind" must be true or false`);
    let sources = [starter.from];
    if (starter.perKind === true) {
      if (!starter.from.includes("KIND")) problems.push(`${WHERE}: ${by} is perKind but "from" has no KIND`);
      if (starter.requires !== "kind") problems.push(`${WHERE}: ${by} is perKind, so it must require "kind"`);
      if (kinds.length === 0) problems.push(`${WHERE}: ${by} is perKind but "kinds" is empty`);
      sources = kinds.map((kind) => starter.from.replaceAll("KIND", kind));
    }
    let substitute = [];
    if (starter.substitute !== undefined) {
      if (Array.isArray(starter.substitute) && starter.substitute.every((word) => typeof word === "string" && word !== "")) substitute = starter.substitute;
      else problems.push(`${WHERE}: ${by} "substitute" must be an array of non-empty words`);
    }
    for (const from of sources) {
      covered.add(from);
      if (!source(from, by)) continue;
      const text = await readFile(path.join(root, from), "utf8");
      for (const word of substitute) if (!text.includes(word)) problems.push(`${WHERE}: ${by} replaces "${word}", which ${from} does not contain`);
    }
  }

  const named = new Set();
  for (const { entry: template, by } of templates) {
    if (typeof template.name !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(template.name)) {
      problems.push(`${WHERE}: ${by} needs a "name" that is a template's file name without .yml`);
      continue;
    }
    needs(template, by);
    if (named.has(template.name)) problems.push(`${WHERE}: the template "${template.name}" is listed twice`);
    named.add(template.name);
    claim(`.github/workflows/${template.name}.yml`, by);
    if (!isFile(path.join(root, "workflow-templates", `${template.name}.yml`))) problems.push(`${WHERE}: ${by} names "${template.name}", which is not in workflow-templates/`);
    if (!Object.hasOwn(syncTemplates, template.name)) problems.push(`${WHERE}: ${by} names "${template.name}", which blueprint/sync.json does not list`);
    covered.add(`workflow-templates/${template.name}.yml`);
  }

  for (const { entry, by } of generated) {
    if (typeof entry.what !== "string" || entry.what.trim() === "") problems.push(`${WHERE}: ${by} needs "what"`);
    claim(entry.to, by);
  }

  for (const { entry, by } of excluded) {
    if (typeof entry.reason !== "string" || entry.reason.trim() === "") problems.push(`${WHERE}: ${by} needs a "reason"`);
    if (typeof entry.from === "string" && source(entry.from, by)) covered.add(entry.from);
    else if (typeof entry.from !== "string") problems.push(`${WHERE}: ${by} needs "from"`);
  }

  const everything = [
    ...(await filesUnder(path.join(root, "blueprint/files"))).map((name) => `blueprint/files/${name}`),
    ...(await readdir(path.join(root, "workflow-templates"))).filter((name) => name.endsWith(".yml")).sort().map((name) => `workflow-templates/${name}`),
  ];
  for (const from of everything) {
    if (!covered.has(from)) problems.push(`${WHERE}: ${from} is neither a starter, a template nor excluded with a reason`);
  }
  return problems;
}
