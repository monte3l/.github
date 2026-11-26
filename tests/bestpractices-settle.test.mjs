// SPDX-FileCopyrightText: Copyright (c) 2026 Enrico Lionello (enri3l) and Giulia Montevecchi (giulmonte), monte3l
// SPDX-License-Identifier: MIT

// bin/bestpractices-settle.mjs against a stub `gh` and a local HTTP server standing in for
// bestpractices.dev, the way tests/bestpractices-sync-cli.test.mjs runs the sync: a person's
// decisions on conflicts become Save links and a file change, and a stale one is never applied.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

const root = path.join(import.meta.dirname, "..");
const script = path.join(root, "bin", "bestpractices-settle.mjs");

const METAL = `--- !!omap
- '0': !!omap
  - Basics: !!omap
    - Basic project website content: !!omap
      - description_good:
          category: MUST
      - contribution:
          category: MUST
`;
const BASELINE = `---
_metadata:
  total_controls: 1
baseline-1:
  General:
    Controls:
      osps_ac_01_01:
        category: MUST
        na_allowed: true
`;
const NAME = "demo-project";
const BADGE = "[![b](https://www.bestpractices.dev/projects/5/badge)](https://www.bestpractices.dev/projects/5)\n";

let server;
let base;
let site = { status: 200, body: [] };

before(async () => {
  server = createServer((req, res) => {
    res.statusCode = site.status;
    res.setHeader("content-type", "application/json");
    res.end(typeof site.body === "string" ? site.body : JSON.stringify(site.body));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const project = (extra = {}) => ({ id: 5, repo_url: `https://github.com/monte3l/${NAME}`, updated_at: "2026-11-01T00:00:00Z", ...extra });

/** Runs the tool. `file` is the repository's answer file (an object), `decisions` the decisions file's content. */
async function run(args, { file = null, decisions = { [NAME]: {} }, env = {}, rawDecisions } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "bp-settle-"));
  writeFileSync(path.join(dir, "metal.yml"), METAL);
  writeFileSync(path.join(dir, "baseline.yml"), BASELINE);
  writeFileSync(path.join(dir, "readme.md"), BADGE);
  writeFileSync(path.join(dir, "issues.json"), "[]");
  writeFileSync(path.join(dir, "commits.json"), "[]");
  if (file !== null) writeFileSync(path.join(dir, "file.json"), JSON.stringify(file));
  const decisionsFile = path.join(dir, "decisions.json");
  writeFileSync(decisionsFile, rawDecisions ?? JSON.stringify(decisions));
  writeFileSync(
    path.join(dir, "gh"),
    `#!/usr/bin/env bash
d="${dir}"
notfound() { printf 'gh: Not Found (HTTP 404)\\n' >&2; exit 1; }
case "$*" in
  *criteria/criteria.yml*) cat "$d/metal.yml" ;;
  *criteria/baseline_criteria.yml*) cat "$d/baseline.yml" ;;
  *"/readme"*) cat "$d/readme.md" ;;
  *"/commits?"*) cat "$d/commits.json" ;;
  *"/contents/.project.d/bestpractices.json"*) notfound ;;
  *"/contents/.bestpractices.json"*) [[ -f "$d/file.json" ]] && cat "$d/file.json" || notfound ;;
  "issue list"*) cat "$d/issues.json" ;;
esac
`,
  );
  chmodSync(path.join(dir, "gh"), 0o755);
  const child = spawn("node", [script, decisionsFile, ...args], {
    cwd: root,
    env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, BESTPRACTICES_BASE_URL: base, BESTPRACTICES_DELAY_MS: "0", GITHUB_ACTIONS: "", ...env },
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (c) => (stdout += c));
  child.stderr.on("data", (c) => (stderr += c));
  const status = await new Promise((resolve) => child.on("close", resolve));
  return { status, stdout, stderr };
}

const answers = (status, justification, name = "description_good") => ({ [`${name}_status`]: status, [`${name}_justification`]: justification });

test("'file' prints a Save link that forces exactly the decided answers, and writes nothing", async () => {
  site = { status: 200, body: [project({ ...answers("Met", "the site's wording"), ...answers("Met", "site two", "contribution") })] };
  const file = { ...answers("Met", "the file's wording"), ...answers("Met", "file two", "contribution") };
  const out = await run([], { file, decisions: { [NAME]: { description_good: "file" } } });
  assert.equal(out.status, 0, out.stderr);
  assert.match(out.stdout, /2 conflicts now, 1 decided, 1 left/);
  assert.match(out.stdout, /site: Met: the site's wording/);
  assert.match(out.stdout, /file: Met: the file's wording/);
  const url = out.stdout.match(/https?:\/\/\S+\/en\/projects\/5\/passing\/edit\?\S+/)?.[0];
  assert.ok(url, out.stdout);
  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get("description_good_justification"), "the file's wording");
  assert.equal(parsed.searchParams.get("overrides"), "description_good_status,description_good_justification");
  assert.ok(!url.includes("contribution"), "the undecided conflict is not in the link");
});

test("'site' with --write puts the site's wording in the file and keeps every other key", async () => {
  site = { status: 200, body: [project(answers("Met", "the site's wording"))] };
  const file = { name: "kept", ...answers("Met", "the file's wording") };
  const dir = mkdtempSync(path.join(tmpdir(), "bp-settle-write-"));
  const out = await run(["--repos", NAME, "--write", dir], { file, decisions: { [NAME]: { description_good: "site" } } });
  assert.equal(out.status, 0, out.stderr);
  assert.match(out.stdout, /wrote \.bestpractices\.json into /);
  assert.deepEqual(JSON.parse(readFileSync(path.join(dir, ".bestpractices.json"), "utf8")), { name: "kept", ...answers("Met", "the site's wording") });
});

test("without --write nothing is written, and it says so", async () => {
  site = { status: 200, body: [project(answers("Met", "site"))] };
  const out = await run([], { file: answers("Met", "file"), decisions: { [NAME]: { description_good: "site" } } });
  assert.equal(out.status, 0, out.stderr);
  assert.match(out.stdout, /nothing written: add --write DIR/);
});

test("a decision for something that is no longer a conflict is skipped and reported, exit 1", async () => {
  site = { status: 200, body: [project(answers("Met", "now the same"))] };
  const dir = mkdtempSync(path.join(tmpdir(), "bp-settle-stale-"));
  const out = await run(["--repos", NAME, "--write", dir], { file: answers("Met", "now the same"), decisions: { [NAME]: { description_good: "site", contribution: "file" } } });
  assert.equal(out.status, 1);
  assert.match(out.stdout, /skipped description_good: not a conflict any more/);
  assert.match(out.stdout, /skipped contribution: not a conflict any more/);
  assert.ok(!existsSync(path.join(dir, ".bestpractices.json")), "a stale choice writes nothing");
  assert.ok(!/passing\/edit/.test(out.stdout), "and makes no link");
});

test("a file with an answer the site would reject is not rewritten", async () => {
  site = { status: 200, body: [project({ ...answers("Met", "site"), contribution_status: "Met" })] };
  const file = { ...answers("Met", "file"), contribution_status: "Perhaps" };
  const dir = mkdtempSync(path.join(tmpdir(), "bp-settle-invalid-"));
  const out = await run(["--repos", NAME, "--write", dir], { file, decisions: { [NAME]: { description_good: "site" } } });
  assert.equal(out.status, 1);
  assert.match(out.stdout, /would reject/);
  assert.ok(!existsSync(path.join(dir, ".bestpractices.json")));
});

test("a project that cannot be checked is exit 3 and nothing is applied", async () => {
  site = { status: 503, body: "down" };
  const out = await run([], { file: answers("Met", "f"), decisions: { [NAME]: { description_good: "file" } } });
  assert.equal(out.status, 3);
  assert.match(out.stdout, /cannot settle/);
  assert.ok(!/passing\/edit/.test(out.stdout));
});

test("it refuses to run in a workflow, where the log is public, and prints no name", async () => {
  site = { status: 200, body: [project(answers("Met", "site"))] };
  const out = await run([], { file: answers("Met", "file"), decisions: { [NAME]: { description_good: "file" } }, env: { GITHUB_ACTIONS: "true" } });
  assert.equal(out.status, 2);
  const text = `${out.stdout}${out.stderr}`;
  assert.match(text, /runs by hand, not in a workflow/);
  assert.ok(!text.includes(NAME) && !text.includes("description_good"), "no project or criterion name");
});

test("a bad decisions file or arguments are usage errors, exit 2", async () => {
  assert.equal((await run([], { rawDecisions: "not json" })).status, 2);
  assert.equal((await run([], { rawDecisions: "[]" })).status, 2);
  assert.equal((await run([], { decisions: { [NAME]: { description_good: "keep" } } })).status, 2, "only file or site");
  assert.equal((await run([], { decisions: { [NAME]: "file" } })).status, 2);
  assert.equal((await run(["--repos", "other"], { decisions: { [NAME]: { description_good: "file" } } })).status, 2, "a repository with no decisions");
  assert.equal((await run(["--write", "/tmp/x"], { decisions: { [NAME]: { a: "file" }, other: { a: "file" } } })).status, 2, "--write needs one repository");
  assert.equal((await run(["--nope"])).status, 2);
});

test("text from the site or the file cannot send a terminal escape sequence or reorder what is shown", async () => {
  const evil = "evil\u001b[2J\u001b]0;owned\u0007 after‮ reversed\u0085 end";
  site = { status: 200, body: [project(answers("Met", evil))] };
  const out = await run([], { file: answers("Met", `file ${evil}`), decisions: { [NAME]: { description_good: "file" } } });
  assert.equal(out.status, 0, out.stderr);
  // eslint-disable-next-line no-control-regex
  assert.ok(!/[\u0000-\u0008\u000b-\u001f\u007f-\u009f‪-‮⁦-⁩]/.test(out.stdout), "no control or bidirectional character reaches the terminal");
  assert.match(out.stdout, /site: Met: evil/, "the readable text is still shown");
});

test("keys that start with an underscore are comments", async () => {
  site = { status: 200, body: [project(answers("Met", "site"))] };
  const out = await run([], { file: answers("Met", "file"), decisions: { _comment: "ignored", [NAME]: { _note: "ignored", description_good: "file" } } });
  assert.equal(out.status, 0, out.stderr);
  assert.match(out.stdout, /1 decided/);
});
