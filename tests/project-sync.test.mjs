// SPDX-FileCopyrightText: Copyright (c) 2026 Enrico Lionello (enri3l) and Giulia Montevecchi (giulmonte), monte3l
// SPDX-License-Identifier: MIT

// bin/project-sync.mjs against a stub `gh`, so no call leaves the machine.
// Run with: node --test "tests/*.test.mjs"
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

const SCRIPT = path.join(import.meta.dirname, "..", "bin", "project-sync.mjs");

// The stub answers what `gh` would print, keyed on the call or the GraphQL text.
// Every mutation is appended to STUB_LOG as one JSON line.
const STUB = `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
const fx = JSON.parse(fs.readFileSync(process.env.STUB_FIXTURE, "utf8"));
const log = (o) => fs.appendFileSync(process.env.STUB_LOG, JSON.stringify(o) + "\\n");
const fail = process.env.STUB_FAIL;
const joined = args.join(" ");
const die = () => { console.error("HTTP 404 (https://api.github.com/repos/monte3l/alpha/issues?state=open)"); process.exit(1); };
if (fail && joined.includes(fail)) die();
if (args[0] === "repo") { console.log(JSON.stringify(fx.repos.map((name) => ({ name })))); process.exit(0); }
if (args[0] === "api" && args[1] === "--paginate") {
  const m = /repos\\/monte3l\\/([^/]+)\\/(issues|releases)/.exec(args[2]);
  for (const row of (fx[m[2]][m[1]] ?? [])) console.log(JSON.stringify(row));
  process.exit(0);
}
const { query, variables } = JSON.parse(fs.readFileSync(0, "utf8"));
if (fail && query.includes(fail)) die();
const out = (data) => console.log(JSON.stringify({ data }));
if (query.includes("mutation")) {
  const op = /\\{\\s*(\\w+)\\(/.exec(query)[1];
  log({ op, input: variables.input });
  if (op === "addProjectV2ItemById") return out({ addProjectV2ItemById: { item: { id: "ITEM_NEW" } } });
  if (op === "addProjectV2DraftIssue") return out({ addProjectV2DraftIssue: { projectItem: { id: "DRAFT_NEW" } } });
  return out({ [op]: {} });
}
if (query.includes("items(first")) return out({ organization: { projectV2: { items: { pageInfo: { hasNextPage: false }, nodes: fx.items } } } });
if (query.includes("discussions(first")) return out({ repository: { discussions: { pageInfo: { hasNextPage: false }, nodes: fx.discussions } } });
return out({ organization: { projectV2: process.env.STUB_NO_PROJECT ? null : { id: "PVT_1", fields: { nodes: fx.fields } } } });
`;

const NOW = "2026-11-27T12:00:00Z";
const FIXTURE = {
  repos: ["alpha", "beta"],
  fields: [
    { id: "F_status", name: "Status", options: [{ id: "S_backlog", name: "Backlog" }, { id: "S_done", name: "Done" }] },
    { id: "F_kind", name: "Kind", options: [{ id: "K_idea", name: "Idea discussion" }, { id: "K_rel", name: "Release" }] },
    { id: "F_source", name: "Source" },
  ],
  items: [
    { id: "ITEM_a1", content: { id: "I_a1", state: "OPEN" }, status: { name: "Backlog" } },
    { id: "ITEM_b1", content: { id: "I_b1", state: "OPEN" }, status: {} },
    { id: "ITEM_old", content: { id: "I_old", state: "CLOSED" }, status: {} },
    { id: "ITEM_idea2", content: {}, source: { text: "https://example.test/d2" }, kind: { name: "Idea discussion" }, status: { name: "Backlog" } },
    { id: "ITEM_rel0", content: {}, source: { text: "https://example.test/rel-existing" }, kind: { name: "Release" }, status: { name: "Done" } },
  ],
  discussions: [
    { title: "Idea one", url: "https://example.test/d1", closed: false, category: { slug: "ideas" } },
    { title: "Idea two", url: "https://example.test/d2", closed: true, category: { slug: "ideas" } },
    { title: "A question", url: "https://example.test/q1", closed: false, category: { slug: "q-a" } },
  ],
  issues: {
    alpha: [
      { node_id: "I_a1" },
      { node_id: "I_a2" },
      { node_id: "P_a3", pull_request: {} },
    ],
    beta: [{ node_id: "I_b1" }],
  },
  releases: {
    alpha: [
      { tag_name: "v1.0.0", html_url: "https://example.test/rel-new", draft: false, prerelease: false, published_at: "2026-11-20T00:00:00Z" },
      { tag_name: "v1.0.0-rc.1", html_url: "https://example.test/rel-pre", draft: false, prerelease: true, published_at: "2026-11-20T00:00:00Z" },
      { tag_name: "v0.9.0", html_url: "https://example.test/rel-old", draft: false, prerelease: false, published_at: "2026-09-01T00:00:00Z" },
      { tag_name: "v1.1.0", html_url: "https://example.test/rel-draft", draft: true, prerelease: false, published_at: null },
      { tag_name: "v0.99.0", html_url: "https://example.test/rel-existing", draft: false, prerelease: false, published_at: "2026-11-10T00:00:00Z" },
    ],
  },
};

function run(args = [], env = {}, fixture = FIXTURE) {
  const dir = mkdtempSync(path.join(tmpdir(), "sync-"));
  writeFileSync(path.join(dir, "gh"), STUB);
  chmodSync(path.join(dir, "gh"), 0o755);
  const log = path.join(dir, "log");
  const fx = path.join(dir, "fixture.json");
  writeFileSync(log, "");
  writeFileSync(fx, JSON.stringify(fixture));
  const result = spawnSync("node", [SCRIPT, ...args], {
    encoding: "utf8",
    env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, OWNER: "monte3l", PROJECT: "5", NOW, STUB_LOG: log, STUB_FIXTURE: fx, ...env },
  });
  const calls = readFileSync(log, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  return { ...result, calls, ops: (op) => calls.filter((c) => c.op === op).map((c) => c.input) };
}

test("it adds the open issues and pull requests that are not on the Project, bot or not", () => {
  const r = run();
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.ops("addProjectV2ItemById").map((i) => i.contentId), ["I_a2", "P_a3"]);
});

test("a newly added item gets Backlog, and one with no Status gets Backlog or Done by its state", () => {
  const r = run();
  const set = r.ops("updateProjectV2ItemFieldValue").filter((i) => i.fieldId === "F_status");
  assert.ok(set.some((i) => i.itemId === "ITEM_NEW" && i.value.singleSelectOptionId === "S_backlog"));
  assert.ok(set.some((i) => i.itemId === "ITEM_b1" && i.value.singleSelectOptionId === "S_backlog"), "an open item without Status");
  assert.ok(set.some((i) => i.itemId === "ITEM_old" && i.value.singleSelectOptionId === "S_done"), "a closed item without Status");
});

test("an open Ideas discussion becomes one draft, once; other categories are ignored", () => {
  const r = run();
  const drafts = r.ops("addProjectV2DraftIssue").map((i) => i.title);
  assert.ok(drafts.includes("Idea one"));
  assert.ok(!drafts.includes("A question"));
  const again = run([], {}, { ...FIXTURE, items: [...FIXTURE.items, { id: "ITEM_idea1", content: {}, source: { text: "https://example.test/d1" }, kind: { name: "Idea discussion" }, status: { name: "Backlog" } }] });
  assert.ok(!again.ops("addProjectV2DraftIssue").map((i) => i.title).includes("Idea one"), "matched by Source, not added twice");
});

test("a mirrored idea whose discussion is no longer open is set to Done", () => {
  const r = run();
  const set = r.ops("updateProjectV2ItemFieldValue");
  assert.ok(set.some((i) => i.itemId === "ITEM_idea2" && i.fieldId === "F_status" && i.value.singleSelectOptionId === "S_done"));
});

test("only a recent stable release is mirrored, as Done, and never twice", () => {
  const r = run();
  const drafts = r.ops("addProjectV2DraftIssue").map((i) => i.title);
  assert.ok(drafts.includes("alpha v1.0.0"));
  for (const skipped of ["v1.0.0-rc.1", "v0.9.0", "v1.1.0", "v0.99.0"]) {
    assert.ok(!drafts.some((t) => t.includes(skipped)), `${skipped} is not mirrored`);
  }
  const set = r.ops("updateProjectV2ItemFieldValue");
  assert.ok(set.some((i) => i.itemId === "DRAFT_NEW" && i.fieldId === "F_kind" && i.value.singleSelectOptionId === "K_rel"));
});

test("the output is counts only: no repository, title or URL", () => {
  const r = run();
  assert.equal(r.stdout.trim(), "3 open issues, 1 open pull requests, 1 open ideas, 2 recent releases in 2 repositories: 4 added, 3 updated");
  assert.ok(!/alpha|beta|example\.test|Idea one/.test(r.stdout + r.stderr));
});

test("--dry-run writes nothing and says so", () => {
  const r = run(["--dry-run"]);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.calls, []);
  assert.match(r.stdout, /would be added/);
});

test("a Project that cannot be read is exit 3, and nothing is written", () => {
  const r = run([], { STUB_NO_PROJECT: "1" });
  assert.equal(r.status, 3);
  assert.deepEqual(r.calls, []);
});

test("a Project without the Kind and Source fields is exit 3 and nothing is written", () => {
  const r = run([], {}, { ...FIXTURE, fields: FIXTURE.fields.slice(0, 1) });
  assert.equal(r.status, 3);
  assert.deepEqual(r.calls, []);
});

test("a failed listing is exit 3, never read as nothing to do", () => {
  assert.equal(run([], { STUB_FAIL: "repo" }).status, 3);
  assert.equal(run([], { STUB_FAIL: "issues?state" }).status, 3);
  assert.equal(run([], { STUB_FAIL: "releases?per_page" }).status, 3);
  assert.equal(run([], { STUB_FAIL: "discussions(first" }).status, 3);
});

test("a failed call leaks no repository name, URL or gh error text into the public log", () => {
  for (const fail of ["repo", "issues?state", "releases?per_page", "discussions(first", "addProjectV2ItemById"]) {
    const r = run([], { STUB_FAIL: fail });
    assert.equal(r.status, 3, fail);
    assert.ok(!/alpha|beta|example\.test|api\.github\.com|HTTP 404/.test(r.stdout + r.stderr), `${fail}: ${r.stderr}`);
  }
});

test("a missing gh is exit 2, a usage-class error, not a failed call", () => {
  const r = spawnSync(process.execPath, [SCRIPT], { encoding: "utf8", env: { ...process.env, PATH: "/nonexistent", OWNER: "monte3l", PROJECT: "5" } });
  assert.equal(r.status, 2, r.stderr);
});

test("a failed write is exit 3", () => {
  assert.equal(run([], { STUB_FAIL: "addProjectV2ItemById" }).status, 3);
  assert.equal(run([], { STUB_FAIL: "addProjectV2DraftIssue" }).status, 3);
});

test("usage errors are exit 2, and never 3", () => {
  assert.equal(run(["--nope"]).status, 2);
  assert.equal(run(["--dry-run", "extra"]).status, 2);
  assert.equal(run([], { PROJECT: "five" }).status, 2);
  assert.equal(run([], { PROJECT: "" }).status, 2);
  assert.equal(run([], { OWNER: "" }).status, 2);
});
