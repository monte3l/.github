#!/usr/bin/env node
// SPDX-FileCopyrightText: Copyright (c) 2026 Enrico Lionello (enri3l) and Giulia Montevecchi (giulmonte), monte3l
// SPDX-License-Identifier: MIT

/**
 * Writes what a new repository starts with into a local directory, for
 * `bin/new-repo.sh`. Touches nothing but that directory and talks to no server.
 *
 *   node bin/bootstrap-render.mjs NAME --out DIR [--kind K] [--claude] [--private] [--scaffold] [--keep-existing]
 *
 * With --keep-existing a file already in DIR is left alone (the groundwork
 * scaffold wins on every path it wrote). Prints one JSON object on stdout:
 * `{ written, kept, left, unfilled, todo, project, syncEntry }`.
 *
 * Exit codes: 0 done, 2 usage or an input that is wrong (an unknown kind, a
 * project that is not in projects.json), 3 a file could not be read or written.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { renderBootstrap } from "./lib/bootstrap.mjs";

const root = path.resolve(import.meta.dirname, "..");
const USAGE = "usage: node bin/bootstrap-render.mjs NAME --out DIR [--kind K] [--claude] [--private] [--scaffold] [--keep-existing]";
const fail = (code, message) => {
  console.error(`bootstrap-render: ${message}`);
  process.exit(code);
};

const args = process.argv.slice(2);
let name = null;
let out = null;
let kind;
let claude = false;
let isPrivate = false;
let scaffold = false;
let keep = false;
const value = (i) => {
  const next = args[i + 1];
  if (next === undefined || next.startsWith("-")) fail(2, `${args[i]} needs a value\n${USAGE}`);
  return next;
};
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--out") out = value(i++);
  else if (args[i] === "--kind") kind = value(i++);
  else if (args[i] === "--claude") claude = true;
  else if (args[i] === "--private") isPrivate = true;
  else if (args[i] === "--scaffold") scaffold = true;
  else if (args[i] === "--keep-existing") keep = true;
  else if (args[i].startsWith("-")) fail(2, `cannot use "${args[i]}"\n${USAGE}`);
  else if (name === null) name = args[i];
  else fail(2, `one repository name only\n${USAGE}`);
}
if (name === null || out === null) fail(2, USAGE);

const readJson = (rel) => JSON.parse(readFileSync(path.join(root, rel), "utf8"));
let result;
try {
  result = renderBootstrap({
    name,
    kind,
    claude,
    private: isPrivate,
    scaffold,
    bootstrap: readJson("blueprint/bootstrap.json"),
    projects: readJson("blueprint/projects.json"),
    designSystem: readJson("blueprint/design-system.json"),
    sync: readJson("blueprint/sync.json"),
    read: (rel) => readFileSync(path.join(root, rel), "utf8"),
  });
} catch (error) {
  fail(error.code === "ENOENT" ? 3 : 2, error.message);
}

const written = [];
const kept = [];
try {
  for (const file of result.files) {
    const target = path.join(out, file.to);
    if (keep && existsSync(target)) {
      kept.push(file.to);
      continue;
    }
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, file.text);
    written.push(file.to);
  }
} catch (error) {
  fail(3, `could not write ${out}: ${error.message}`);
}
// A kept file is the scaffold's, so only a written one can still hold a placeholder of ours.
const unfilled = result.unfilled.filter((entry) => written.includes(entry.to));
console.log(JSON.stringify({ written, kept, left: result.left, unfilled, todo: result.todo, project: result.project, syncEntry: result.syncEntry }, null, 2));
