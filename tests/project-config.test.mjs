// SPDX-FileCopyrightText: Copyright (c) 2026 Enrico Lionello (enri3l) and Giulia Montevecchi (giulmonte), monte3l
// SPDX-License-Identifier: MIT

// bin/project-config.mjs: the planning logic on fixtures, and the CLI against a stub `gh`.
// Run with: node --test "tests/*.test.mjs"
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { composeReadme, mergeOptions, parseArgs, plan } from "../bin/project-config.mjs";

const ROOT = path.join(import.meta.dirname, "..");
const CONFIG_FILE = path.join(ROOT, "blueprint", "project.json");
const config = JSON.parse(readFileSync(CONFIG_FILE, "utf8"));
const projects = JSON.parse(readFileSync(path.join(ROOT, "blueprint", "projects.json"), "utf8"));

const option = (id, name) => ({ id, name, color: "GRAY", description: "" });

// A Project that already matches the config.
function cleanLive() {
  return {
    id: "PVT_1",
    title: config.title,
    shortDescription: config.shortDescription,
    readme: composeReadme(config, projects),
    fields: {
      nodes: [
        { id: "F_status", name: "Status", options: config.status.map((n, i) => option(`S${i}`, n)) },
        { id: "F_kind", name: "Kind", options: config.fields[0].options.map((n, i) => option(`K${i}`, n)) },
        { id: "F_source", name: "Source" },
        ...config.issueFields.map((n, i) => ({ id: `I${i}`, name: n })),
      ],
    },
    views: { nodes: config.views.map((v, i) => ({ id: `V${i}`, name: v.name, layout: v.layout, filter: v.filter })) },
  };
}
const orgFields = config.issueFields.map((name, i) => ({ name, node_id: `IFD_${i}` }));
const states = (p) => p.lines.filter((l) => l.state !== "SKIP").map((l) => l.state);

test("blueprint/project.json is well formed", () => {
  assert.equal(new Set(config.views.map((v) => v.name)).size, config.views.length, "view names are unique");
  assert.deepEqual(config.status, ["Backlog", "Todo", "In progress", "In review", "Done", "Not planned", "Duplicate"]);
  for (const v of config.views) {
    assert.ok(["BOARD_LAYOUT", "TABLE_LAYOUT", "ROADMAP_LAYOUT"].includes(v.layout), v.name);
    assert.ok(!/\bOR\b|[()]/.test(v.filter), `${v.name}: no cross-field OR or parentheses, the docs say they are unsupported`);
  }
});

test("a Project that matches the config has no drift and nothing to apply", () => {
  const p = plan(config, projects, cleanLive(), orgFields);
  assert.ok(states(p).every((s) => s === "OK"), JSON.stringify(p.lines.filter((l) => l.state === "DRIFT")));
  assert.equal(p.todo.length, 0);
});

test("what only the UI can set always prints as SKIP, one line per view setting and per workflow", () => {
  const p = plan(config, projects, cleanLive(), orgFields);
  assert.equal(p.lines.filter((l) => l.state === "SKIP").length, config.views.length + config.workflows.length);
});

test("a view is matched by renamedFrom, and its fix is an update, not a new view", () => {
  const live = cleanLive();
  const idx = config.views.findIndex((v) => v.renamedFrom);
  live.views.nodes[idx].name = config.views[idx].renamedFrom;
  const p = plan(config, projects, live, orgFields);
  assert.equal(p.todo.length, 1);
  assert.match(p.lines.find((l) => l.state === "DRIFT").label, /^view /);
});

test("a missing view, a changed layout and a changed filter are each drift", () => {
  const live = cleanLive();
  live.views.nodes.pop();
  live.views.nodes[0].layout = "TABLE_LAYOUT";
  live.views.nodes[1].filter = "is:open";
  const p = plan(config, projects, live, orgFields);
  assert.equal(p.lines.filter((l) => l.state === "DRIFT").length, 3);
});

test("a Status option keeps its id, colour and place when only its case changes", () => {
  const live = cleanLive();
  live.fields.nodes[0].options[2] = { id: "KEEP", name: "In Progress", color: "YELLOW", description: "d" };
  const p = plan(config, projects, live, orgFields);
  assert.equal(p.lines.find((l) => l.label === "Status options").state, "DRIFT");
  const merged = mergeOptions(live.fields.nodes[0].options, config.status);
  assert.deepEqual(merged.map((o) => o.name), config.status, "the wanted order and spelling");
  assert.deepEqual(merged[2], { id: "KEEP", name: "In progress", color: "YELLOW", description: "d" });
});

test("a new Status option has no id, so GitHub creates it", () => {
  const merged = mergeOptions([option("S0", "Todo"), option("S1", "Done")], config.status);
  assert.equal(merged.find((o) => o.name === "Backlog").id, undefined);
  assert.equal(merged.find((o) => o.name === "Todo").id, "S0");
  assert.equal(merged.find((o) => o.name === "Done").id, "S1");
});

test("an issue field the organization does not have is drift with no fix", () => {
  const live = cleanLive();
  live.fields.nodes = live.fields.nodes.filter((f) => f.name !== "Effort");
  const p = plan(config, projects, live, orgFields.filter((f) => f.name !== "Effort"));
  assert.ok(p.lines.some((l) => l.label === "issue field Effort" && l.state === "DRIFT"));
  assert.equal(p.todo.length, 0);
});

test("the README lists every registered project", () => {
  const readme = composeReadme(config, projects);
  for (const p of projects) assert.ok(readme.includes(`github.com/monte3l/${p.repo}/releases`), p.repo);
});

test("--yes goes only with --apply, and an unknown argument is a usage error", () => {
  assert.throws(() => parseArgs(["--yes"]));
  assert.throws(() => parseArgs(["--nope"]));
  assert.deepEqual(parseArgs(["--apply", "--yes"]), { apply: true, yes: true });
  assert.deepEqual(parseArgs([]), { apply: false, yes: false });
});

// The CLI, with a stub that serves a Project missing everything and logs each mutation.
const STUB = `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
if (args[0] === "api" && args[1].startsWith("orgs/")) { console.log(JSON.stringify(JSON.parse(process.env.STUB_ORG_FIELDS))); process.exit(0); }
const { query, variables } = JSON.parse(fs.readFileSync(0, "utf8"));
if (process.env.STUB_FAIL && query.includes(process.env.STUB_FAIL)) process.exit(1);
const out = (data) => console.log(JSON.stringify({ data }));
if (query.includes("mutation")) {
  const op = /\\{\\s*(\\w+)\\(/.exec(query)[1];
  fs.appendFileSync(process.env.STUB_LOG, op + "\\n");
  return out({ [op]: { projectV2View: { id: "V_NEW" } } });
}
out({ organization: { projectV2: JSON.parse(process.env.STUB_LIVE) } });
`;

function cli(args, env = {}, live = null) {
  const dir = mkdtempSync(path.join(tmpdir(), "config-"));
  writeFileSync(path.join(dir, "gh"), STUB);
  chmodSync(path.join(dir, "gh"), 0o755);
  const log = path.join(dir, "log");
  writeFileSync(log, "");
  const bare = { id: "PVT_1", title: "old", shortDescription: "", readme: "", fields: { nodes: [{ id: "F_status", name: "Status", options: [] }] }, views: { nodes: [] } };
  const result = spawnSync("node", [path.join(ROOT, "bin", "project-config.mjs"), ...args], {
    encoding: "utf8",
    env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, OWNER: "monte3l", PROJECT: "5", STUB_LOG: log, STUB_LIVE: JSON.stringify(live ?? bare), STUB_ORG_FIELDS: JSON.stringify(orgFields), ...env },
  });
  return { ...result, ops: readFileSync(log, "utf8").split("\n").filter(Boolean) };
}

test("--check exits 1 on drift and 0 when clean, and writes nothing", () => {
  const drift = cli([]);
  assert.equal(drift.status, 1, drift.stderr);
  assert.deepEqual(drift.ops, []);
  assert.equal(cli([], {}, cleanLive()).status, 0);
});

test("--apply --yes sets what drifted, and issues no delete", () => {
  const r = cli(["--apply", "--yes"]);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.ops.includes("updateProjectV2"));
  assert.ok(r.ops.includes("updateProjectV2Field"));
  assert.ok(r.ops.includes("createProjectV2Field"));
  assert.ok(r.ops.includes("createProjectV2View"));
  assert.ok(r.ops.includes("updateProjectV2View"));
  assert.ok(r.ops.includes("createProjectV2IssueField"));
  assert.ok(!r.ops.some((o) => /^delete/i.test(o)), "never a delete");
});

test("--apply without --yes and without a terminal is a usage error, and writes nothing", () => {
  const r = cli(["--apply"]);
  assert.equal(r.status, 2);
  assert.deepEqual(r.ops, []);
});

test("a failed call is exit 3, and a missing Project is exit 3", () => {
  assert.equal(cli([], { STUB_FAIL: "views(first" }).status, 3);
  assert.equal(cli([], { STUB_LIVE: "null" }, null).status, 3);
});

test("usage errors are exit 2", () => {
  assert.equal(cli(["--nope"]).status, 2);
  assert.equal(cli([], { PROJECT: "five" }).status, 2);
  assert.equal(cli([], { OWNER: "" }).status, 2);
});
