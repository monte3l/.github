// SPDX-FileCopyrightText: Copyright (c) 2026 Enrico Lionello (enri3l) and Giulia Montevecchi (giulmonte), monte3l
// SPDX-License-Identifier: MIT

// bin/bestpractices-sync.mjs against a stub `gh` and a local HTTP server that stands in for
// bestpractices.dev: discovery, the three states, the tracking issue, the file it writes, and
// what a workflow log may say.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

import { formatMarker, hashAnswer } from "../bin/lib/bestpractices.mjs";

const root = path.join(import.meta.dirname, "..");
const script = path.join(root, "bin", "bestpractices-sync.mjs");

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
const REPO_URL = `https://github.com/monte3l/${NAME}`;

let server;
let base;
/** What the stand-in site answers for each lookup: a status code and a body. */
let site = { status: 200, body: "[]" };

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

const project = (extra = {}) => ({
  id: 5,
  repo_url: REPO_URL,
  updated_at: "2026-11-01T00:00:00Z",
  ...extra,
});

/**
 * Runs the CLI. `files` maps an answer-file path to its text, `issues` is what `gh issue list`
 * returns, `readme` the README text. The stub logs every call and keeps the last --body-file.
 */
// A project is trusted only when the repository's README names it, so every repository here has the
// badge for project 5 unless a test says otherwise (`readme: null` is no README at all).
const BADGE = "[![OpenSSF Best Practices](https://www.bestpractices.dev/projects/5/badge)](https://www.bestpractices.dev/projects/5)\n";

async function run(args, { files = {}, issues = [], readme = BADGE, env = {} } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "bp-cli-"));
  const calls = path.join(dir, "calls.log");
  writeFileSync(calls, "");
  writeFileSync(path.join(dir, "metal.yml"), METAL);
  writeFileSync(path.join(dir, "baseline.yml"), BASELINE);
  writeFileSync(path.join(dir, "issues.json"), JSON.stringify(issues));
  writeFileSync(path.join(dir, "commits.json"), "[]");
  if (readme !== null) writeFileSync(path.join(dir, "readme.md"), readme);
  for (const [name, text] of Object.entries(files)) writeFileSync(path.join(dir, `file-${name.replace(/\W/g, "_")}`), text);
  const stub = path.join(dir, "gh");
  writeFileSync(
    stub,
    `#!/usr/bin/env bash
d="${dir}"
printf '%s\\n' "$*" >>"$d/calls.log"
args=("$@")
for ((i = 0; i < \${#args[@]}; i++)); do
  [[ "\${args[$i]}" == "--body-file" ]] && cp "\${args[$((i + 1))]}" "$d/last-body.md"
done
notfound() { printf 'gh: Not Found (HTTP 404)\\n' >&2; exit 1; }
case "$*" in
  *criteria/criteria.yml*) cat "$d/metal.yml" ;;
  *criteria/baseline_criteria.yml*) cat "$d/baseline.yml" ;;
  *"/readme"*) [[ -f "$d/readme.md" ]] && cat "$d/readme.md" || notfound ;;
  *"/commits?"*) cat "$d/commits.json" ;;
  *"/contents/.project.d/bestpractices.json"*) [[ -f "$d/file-_project_d_bestpractices_json" ]] && cat "$d/file-_project_d_bestpractices_json" || notfound ;;
  *"/contents/.bestpractices.json"*) [[ -f "$d/file-_bestpractices_json" ]] && cat "$d/file-_bestpractices_json" || notfound ;;
  "issue list"*) cat "$d/issues.json" ;;
esac
`,
  );
  chmodSync(stub, 0o755);
  const child = spawn("node", [script, ...args], {
    cwd: root,
    env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, BESTPRACTICES_BASE_URL: base, BESTPRACTICES_DELAY_MS: "0", GITHUB_ACTIONS: "", ...env },
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (c) => (stdout += c));
  child.stderr.on("data", (c) => (stderr += c));
  const status = await new Promise((resolve) => child.on("close", resolve));
  const log = readFileSync(calls, "utf8").split("\n").filter(Boolean);
  const bodyPath = path.join(dir, "last-body.md");
  return { status, stdout, stderr, calls: log, body: existsSync(bodyPath) ? readFileSync(bodyPath, "utf8") : null, dir };
}

const one = async (extra, opts) => {
  const out = await run(["--repos", NAME, "--json", ...extra], opts);
  assert.equal(out.status, 0, out.stderr);
  return { ...out, result: JSON.parse(out.stdout).results[0] };
};

test("a repository with no project on the site is skipped, not an error", async () => {
  site = { status: 200, body: [] };
  const { result } = await one([]);
  assert.equal(result.state, "not-registered");
  assert.equal(result.needsAction, false);
});

test("a project found only by its home page is not this repository's", async () => {
  site = { status: 200, body: [project({ repo_url: "https://github.com/monte3l/other" })] };
  assert.equal((await one([])).result.state, "not-registered");
});

test("with several projects for one repository, the one the README badge names is used", async () => {
  site = { status: 200, body: [project({ id: 6, description_good_status: "Unmet" }), project({ description_good_status: "Met" })] };
  const { result } = await one([]);
  assert.equal(result.id, 5);
  assert.equal(result.state, "site-ahead", "the answers are the bound project's, not the other one's");
});

test("no README badge means the site's claim on the URL is not trusted: an error, nothing written", async () => {
  site = { status: 200, body: [project({ description_good_status: "Met" })] };
  for (const readme of [null, "# Demo\n\nNo badge here.\n"]) {
    const { result } = await one([], { readme });
    assert.equal(result.state, "error");
    assert.match(result.error, /no README badge/);
    assert.equal(result.needsAction, false);
  }
  const dir = mkdtempSync(path.join(tmpdir(), "bp-nobadge-"));
  const out = await run(["--repos", NAME, "--write", dir], { readme: null });
  assert.equal(out.status, 3);
  assert.ok(!existsSync(path.join(dir, ".bestpractices.json")));
});

test("a README badge that points at another project is an error", async () => {
  site = { status: 200, body: [project()] };
  const { result } = await one([], { readme: "[![badge](https://www.bestpractices.dev/projects/999/badge)](https://www.bestpractices.dev/projects/999)" });
  assert.equal(result.state, "error");
  assert.match(result.error, /another project/);
});

test("both answer files present is an error, and nothing is written", async () => {
  site = { status: 200, body: [project({ description_good_status: "Met" })] };
  const out = await one([], { files: { ".bestpractices.json": "{}", ".project.d/bestpractices.json": "{}" } });
  assert.equal(out.result.state, "error");
  assert.match(out.result.error, /both answer files/);
});

test("an outage is an error for that project, and --check exits 3", async () => {
  site = { status: 503, body: "down" };
  const out = await run(["--repos", NAME, "--check"]);
  assert.equal(out.status, 3);
  assert.match(out.stdout, /1 that could not be checked/);
  assert.ok(!out.calls.some((c) => c.startsWith("issue create")), "an outage never opens anything");
});

test("a site that sends something that is not JSON is an error, not a crash", async () => {
  site = { status: 200, body: "<html>maintenance</html>" };
  const { result } = await one([]);
  assert.equal(result.state, "error");
});

test("an answer only the site has is site ahead, and --write puts it in the file", async () => {
  site = { status: 200, body: [project({ description_good_status: "Met", description_good_justification: "README says so" })] };
  const out = await one([]);
  assert.equal(out.result.state, "site-ahead");
  assert.deepEqual(out.result.siteAhead, ["description_good"]);
  assert.equal(out.result.needsAction, true);
  const dir = mkdtempSync(path.join(tmpdir(), "bp-write-"));
  const written = await run(["--repos", NAME, "--write", dir]);
  assert.equal(written.status, 0, written.stderr);
  assert.deepEqual(JSON.parse(readFileSync(path.join(dir, ".bestpractices.json"), "utf8")), {
    description_good_justification: "README says so",
    description_good_status: "Met",
  });
});

test("--write keeps a file's other keys and the file it already has", async () => {
  site = { status: 200, body: [project({ description_good_status: "Met" })] };
  const dir = mkdtempSync(path.join(tmpdir(), "bp-write-"));
  mkdirSync(path.join(dir, ".project.d"));
  const existing = JSON.stringify({ name: "kept", contribution_status: "?" });
  const out = await run(["--repos", NAME, "--write", dir], { files: { ".project.d/bestpractices.json": existing } });
  assert.equal(out.status, 0, out.stderr);
  assert.ok(!existsSync(path.join(dir, ".bestpractices.json")), "the second path is not created");
  // The file's own keys stay where they were, a `?` placeholder is not noise to remove, and the new
  // answer goes after them.
  assert.deepEqual(JSON.parse(readFileSync(path.join(dir, ".project.d", "bestpractices.json"), "utf8")), {
    name: "kept",
    contribution_status: "?",
    description_good_status: "Met",
  });
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(path.join(dir, ".project.d", "bestpractices.json"), "utf8"))), ["name", "contribution_status", "description_good_status"]);
});

test("a file with an answer the site rejects is reported and never rewritten", async () => {
  site = { status: 200, body: [project({ contribution_status: "Met" })] };
  const dir = mkdtempSync(path.join(tmpdir(), "bp-write-"));
  const out = await run(["--repos", NAME, "--write", dir], { files: { ".bestpractices.json": JSON.stringify({ description_good_status: "N/A" }) } });
  assert.equal(out.status, 0, out.stderr);
  assert.ok(!existsSync(path.join(dir, ".bestpractices.json")), "nothing is written while an invalid answer remains");
  const { result } = await one([], { files: { ".bestpractices.json": JSON.stringify({ description_good_status: "N/A" }) } });
  assert.deepEqual(result.invalid, ["description_good"]);
  assert.equal(result.pending, true);
});

test("an answer only the file has is repo ahead, and --issue opens an issue with a link to save", async () => {
  site = { status: 200, body: [project()] };
  const files = { ".bestpractices.json": JSON.stringify({ description_good_status: "Met", description_good_justification: "from the file" }) };
  const out = await run(["--repos", NAME, "--issue"], { files });
  assert.equal(out.status, 0, out.stderr);
  const create = out.calls.find((c) => c.startsWith("issue create"));
  assert.ok(create, "the issue is opened");
  assert.match(create, /--title OpenSSF Best Practices sync --label bestpractices-sync/);
  assert.match(out.body, /\]\(http:\/\/127\.0\.0\.1:\d+\/en\/projects\/5\/passing\/edit\?description_good_status=Met&description_good_justification=from%20the%20file&overrides=description_good_status,description_good_justification\)/);
  assert.match(out.body, /<!-- bp-agreed:\{.*\} -->/);
});

test("both sides moved to different answers is a conflict: listed, never changed", async () => {
  const was = { status: "Unmet", justification: "old" };
  site = { status: 200, body: [project({ description_good_status: "Met", description_good_justification: "site" })] };
  const issues = [
    { number: 3, title: "OpenSSF Best Practices sync", state: "OPEN", body: `x\n${formatMarker(new Map([["description_good", hashAnswer(was)]]))}` },
  ];
  const files = { ".bestpractices.json": JSON.stringify({ description_good_status: "Unmet", description_good_justification: "file" }) };
  const out = await run(["--repos", NAME, "--issue"], { files, issues });
  assert.equal(out.status, 0, out.stderr);
  assert.match(out.body, /## Changed on both sides/);
  assert.ok(out.calls.some((c) => c.startsWith("issue edit 3")), "the issue is rewritten");
  const json = await one([], { files, issues });
  assert.equal(json.result.state, "conflict");
  assert.ok(!json.calls.some((c) => c.startsWith("api") && c.includes("git/refs")), "no branch, no pull request");
});

test("when only the site moved since the snapshot, the file takes the site's answer", async () => {
  const was = { status: "Unmet", justification: "old" };
  site = { status: 200, body: [project({ description_good_status: "Met", description_good_justification: "site" })] };
  const issues = [{ number: 3, title: "OpenSSF Best Practices sync", state: "CLOSED", body: formatMarker(new Map([["description_good", hashAnswer(was)]])) }];
  const files = { ".bestpractices.json": JSON.stringify({ description_good_status: "Unmet", description_good_justification: "old" }) };
  const { result } = await one([], { files, issues });
  assert.equal(result.state, "site-ahead");
  assert.deepEqual(result.siteAhead, ["description_good"]);
});

test("in sync: nothing to do, --check exits 0, and an open issue is closed", async () => {
  site = { status: 200, body: [project({ description_good_status: "Met", description_good_justification: "same" })] };
  const files = { ".bestpractices.json": JSON.stringify({ description_good_status: "Met", description_good_justification: "same" }) };
  const checked = await run(["--repos", NAME, "--check"], { files });
  assert.equal(checked.status, 0, checked.stderr);
  const issues = [{ number: 9, title: "OpenSSF Best Practices sync", state: "OPEN", body: "stale" }];
  const out = await run(["--repos", NAME, "--issue"], { files, issues });
  assert.equal(out.status, 0, out.stderr);
  assert.ok(out.calls.some((c) => c.startsWith("issue close 9")), "the issue is closed");
  assert.ok(!out.calls.some((c) => c.startsWith("issue create")));
});

test("an in-sync project with no issue still gets one, closed, so the snapshot is kept", async () => {
  site = { status: 200, body: [project({ description_good_status: "Met", description_good_justification: "same" })] };
  const files = { ".bestpractices.json": JSON.stringify({ description_good_status: "Met", description_good_justification: "same" }) };
  const planned = await one([], { files });
  assert.equal(planned.result.needsAction, true, "the plan includes it, so the snapshot is written");
  const out = await run(["--repos", NAME, "--issue"], { files });
  assert.equal(out.status, 0, out.stderr);
  assert.match(out.calls.find((c) => c.startsWith("issue create")), /--label bestpractices-sync,freshness/);
  assert.ok(out.calls.some((c) => c.startsWith("issue close ")), "it is closed at once: nothing needs a person");
  assert.match(out.body, /<!-- bp-agreed:\{"v":1,"a":\{"description_good":"[0-9a-f]{10}"\}\} -->/);
  // With the issue in place and unchanged, the next run has nothing to do.
  const issues = [{ number: 4, title: "OpenSSF Best Practices sync", state: "CLOSED", body: out.body.trim() }];
  assert.equal((await one([], { files, issues })).result.needsAction, false);
});

test("a typo in the file never produces a link that clears the site's answer", async () => {
  const met = { status: "Met", justification: "right" };
  site = { status: 200, body: [project({ description_good_status: "Met", description_good_justification: "right" })] };
  const issues = [{ number: 3, title: "OpenSSF Best Practices sync", state: "CLOSED", body: formatMarker(new Map([["description_good", hashAnswer(met)]])) }];
  const files = { ".bestpractices.json": JSON.stringify({ description_good_status: "Mett", description_good_justification: "right" }) };
  const { result } = await one([], { files, issues });
  assert.deepEqual(result.repoAhead, []);
  assert.deepEqual(result.invalid, ["description_good"]);
  const out = await run(["--repos", NAME, "--issue"], { files, issues });
  assert.ok(!/projects\/5\/passing\/edit/.test(out.body), "no proposal link");
});

test("a table cell cannot carry an HTML comment, so an answer cannot plant a snapshot", async () => {
  const fake = '<!-- bp-agreed:{"v":1,"a":{"planted":"aaaaaaaaaa"}} -->';
  site = { status: 200, body: [project({ description_good_status: "Met", description_good_justification: "site" })] };
  const files = { ".bestpractices.json": JSON.stringify({ description_good_status: "Met", description_good_justification: fake }) };
  const out = await run(["--repos", NAME, "--issue"], { files });
  assert.equal(out.status, 0, out.stderr);
  assert.ok(!out.body.includes(fake), "the text is escaped");
  assert.equal(out.body.match(/<!-- bp-agreed:/g).length, 1, "only the real marker");
});

test("a backslash in an answer cannot end a table cell", async () => {
  site = { status: 200, body: [project({ description_good_status: "Met", description_good_justification: "site" })] };
  const files = { ".bestpractices.json": JSON.stringify({ description_good_status: "Met", description_good_justification: "a \\| b" }) };
  const out = await run(["--repos", NAME, "--issue"], { files });
  assert.equal(out.status, 0, out.stderr);
  // `\|` in the answer is shown as an escaped backslash and an escaped pipe, never as a bare pipe.
  assert.ok(out.body.includes("a \\\\\\| b"), `body: ${out.body}`);
});

test("--write refuses a symbolic link in the checkout and leaves the file it points at alone", async () => {
  site = { status: 200, body: [project({ description_good_status: "Met" })] };
  const outside = mkdtempSync(path.join(tmpdir(), "bp-outside-"));
  const victim = path.join(outside, "tools-file");
  writeFileSync(victim, "untouched\n");

  const linkedFile = mkdtempSync(path.join(tmpdir(), "bp-link-"));
  symlinkSync(victim, path.join(linkedFile, ".bestpractices.json"));
  const first = await run(["--repos", NAME, "--write", linkedFile]);
  assert.equal(first.status, 3);
  assert.equal(readFileSync(victim, "utf8"), "untouched\n");

  const linkedDir = mkdtempSync(path.join(tmpdir(), "bp-link-"));
  symlinkSync(outside, path.join(linkedDir, ".project.d"));
  const second = await run(["--repos", NAME, "--write", linkedDir], { files: { ".project.d/bestpractices.json": "{}" } });
  assert.equal(second.status, 3);
  assert.ok(!existsSync(path.join(outside, "bestpractices.json")), "nothing was written through the linked folder");

  const text = `${first.stdout}${first.stderr}${second.stdout}${second.stderr}`;
  assert.ok(!text.includes(outside) && !text.includes(linkedFile), "the message names no path");
});

test("a leg that writes fails when its project could not be checked", async () => {
  site = { status: 503, body: "down" };
  const dir = mkdtempSync(path.join(tmpdir(), "bp-leg-"));
  assert.equal((await run(["--repos", NAME, "--write", dir])).status, 3);
  assert.equal((await run(["--repos", NAME, "--issue"])).status, 3);
});

test("--check exits 1 when a person has something to do", async () => {
  site = { status: 200, body: [project()] };
  const files = { ".bestpractices.json": JSON.stringify({ description_good_status: "Met" }) };
  assert.equal((await run(["--repos", NAME, "--check"], { files })).status, 1);
});

test("a justification differing by one character is a difference", async () => {
  site = { status: 200, body: [project({ description_good_status: "Met", description_good_justification: "a b" })] };
  const files = { ".bestpractices.json": JSON.stringify({ description_good_status: "Met", description_good_justification: "a  b" }) };
  const { result } = await one([], { files });
  assert.notEqual(result.state, "in-sync");
});

test("--public and a workflow run print counts only, never a repository or a criterion", async () => {
  site = { status: 200, body: [project({ description_good_status: "Met" })] };
  const files = { ".bestpractices.json": JSON.stringify({ contribution_status: "Met" }) };
  for (const [args, env] of [
    [["--repos", NAME, "--public"], {}],
    [["--repos", NAME], { GITHUB_ACTIONS: "true" }],
    [["--repos", NAME, "--write", mkdtempSync(path.join(tmpdir(), "bp-ci-"))], { GITHUB_ACTIONS: "true" }],
    [["--repos", NAME, "--issue"], { GITHUB_ACTIONS: "true" }],
  ]) {
    const out = await run(args, { files, env });
    const text = `${out.stdout}${out.stderr}`;
    assert.ok(!text.includes(NAME), `${args.join(" ")} printed the repository name`);
    assert.ok(!/description_good|contribution/.test(text), `${args.join(" ")} printed a criterion`);
  }
  site = { status: 503, body: "down" };
  const failed = await run(["--repos", NAME], { env: { GITHUB_ACTIONS: "true" } });
  assert.ok(!`${failed.stdout}${failed.stderr}`.includes(NAME), "a failure names no repository");
});

test("usage errors exit 2", async () => {
  assert.equal((await run(["--public", "--json"])).status, 2);
  assert.equal((await run(["--write", "/tmp/x"])).status, 2, "--write needs exactly one repository");
  assert.equal((await run(["--repos", "a,b", "--issue"])).status, 2);
  assert.equal((await run(["--repos", "bad name"])).status, 2);
  assert.equal((await run(["--nope"])).status, 2);
});
