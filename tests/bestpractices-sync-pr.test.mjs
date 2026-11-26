// SPDX-FileCopyrightText: Copyright (c) 2026 Enrico Lionello (enri3l) and Giulia Montevecchi (giulmonte), monte3l
// SPDX-License-Identifier: MIT

// bin/bestpractices-sync-pr.sh on a throwaway checkout, in dry-run mode: what it will send, what it
// refuses, and what it says in a workflow log. The commit and the pull request need the API, which
// the real runs cover.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

const script = path.join(import.meta.dirname, "..", "bin", "bestpractices-sync-pr.sh");

const git = (cwd, ...args) => {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
};

/** A checkout with one commit; `commit` holds files that are already tracked. */
function checkout(commit = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "bp-pr-"));
  git(dir, "init", "-q");
  git(dir, "config", "user.email", "t@example.com");
  git(dir, "config", "user.name", "t");
  git(dir, "config", "commit.gpgsign", "false");
  writeFileSync(path.join(dir, "README.md"), "x\n");
  for (const [file, text] of Object.entries(commit)) {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    writeFileSync(path.join(dir, file), text);
  }
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "init");
  return dir;
}

const put = (dir, file, text) => {
  mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  writeFileSync(path.join(dir, file), text);
};

function run(dir, { repo = "monte3l/demo", env = {} } = {}) {
  return spawnSync("bash", [script, repo, dir], {
    encoding: "utf8",
    env: { ...process.env, DRY_RUN: "1", GITHUB_ACTIONS: "", ...env },
  });
}

test("nothing changed: nothing to do", () => {
  const dir = checkout({ ".bestpractices.json": "{}\n" });
  const r = run(dir);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /nothing to do/);
});

test("a changed answer file is sent, and the dry run says so", () => {
  const dir = checkout({ ".bestpractices.json": "{}\n" });
  put(dir, ".bestpractices.json", '{\n  "contribution_status": "Met"\n}\n');
  const r = run(dir);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /monte3l\/demo: \.bestpractices\.json, \d+ bytes \(changed\)/);
  assert.match(r.stdout, /dry run: would commit chore\/bestpractices-sync-[0-9a-f]{12} to monte3l\/demo/);
});

test("a new file is accepted, and so is the .project.d spelling", () => {
  const added = checkout();
  put(added, ".bestpractices.json", '{\n  "contribution_status": "Met"\n}\n');
  assert.match(run(added).stdout, /\(new\)/);
  const other = checkout();
  put(other, ".project.d/bestpractices.json", '{\n  "contribution_status": "Met"\n}\n');
  assert.equal(run(other).status, 0);
});

test("the same content gives the same branch, different content another", () => {
  const branch = (text) => {
    const dir = checkout({ ".bestpractices.json": "{}\n" });
    put(dir, ".bestpractices.json", text);
    return /chore\/bestpractices-sync-[0-9a-f]{12}/.exec(run(dir).stdout)?.[0];
  };
  const a = branch('{"a_status":"Met"}\n');
  assert.ok(a);
  assert.equal(branch('{"a_status":"Met"}\n'), a);
  assert.notEqual(branch('{"a_status":"Unmet"}\n'), a);
});

test("any other file in the change set means nothing is sent", () => {
  const dir = checkout({ ".bestpractices.json": "{}\n" });
  put(dir, ".bestpractices.json", '{"a_status":"Met"}\n');
  put(dir, "src/other.txt", "stray\n");
  const r = run(dir);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /not exactly one/);
});

test("both answer files changed is refused", () => {
  const dir = checkout();
  put(dir, ".bestpractices.json", '{"a_status":"Met"}\n');
  put(dir, ".project.d/bestpractices.json", '{"a_status":"Met"}\n');
  assert.equal(run(dir).status, 1);
});

test("a file that is not a JSON object is refused", () => {
  for (const text of ["[]\n", "not json\n", '"text"\n']) {
    const dir = checkout({ ".bestpractices.json": "{}\n" });
    put(dir, ".bestpractices.json", text);
    const r = run(dir);
    assert.equal(r.status, 1, text);
    assert.match(r.stderr, /not a JSON object/);
  }
});

test("a deleted answer file is refused: a sync adds or changes, never removes", () => {
  const dir = checkout({ ".bestpractices.json": "{}\n" });
  spawnSync("rm", [path.join(dir, ".bestpractices.json")]);
  assert.equal(run(dir).status, 1);
});

test("a repository outside the org is a usage error, and so is a missing token on a real run", () => {
  const dir = checkout();
  assert.equal(run(dir, { repo: "other/demo" }).status, 2);
  assert.equal(run(dir, { repo: "monte3l/a;b" }).status, 2);
  const real = run(dir, { env: { DRY_RUN: "0", GH_TOKEN: "" } });
  assert.equal(real.status, 2);
  assert.match(real.stderr, /GH_TOKEN is not set/);
  assert.equal(spawnSync("bash", [script], { encoding: "utf8" }).status, 2);
});

test("a workflow log says how many files, never which file, branch or repository", () => {
  const dir = checkout({ ".bestpractices.json": "{}\n" });
  put(dir, ".bestpractices.json", '{"a_status":"Met"}\n');
  const r = run(dir, { env: { GITHUB_ACTIONS: "true" } });
  assert.equal(r.status, 0, r.stderr);
  const text = `${r.stdout}${r.stderr}`;
  assert.match(text, /1 file, \d+ bytes/);
  assert.ok(!/bestpractices\.json|chore\/bestpractices-sync|monte3l\/demo/.test(text), `leaked: ${text}`);

  const stray = checkout();
  put(stray, "src/other.txt", "stray\n");
  const refused = run(stray, { env: { GITHUB_ACTIONS: "true" } });
  assert.equal(refused.status, 1);
  assert.ok(!/other\.txt/.test(`${refused.stdout}${refused.stderr}`), "a refusal names no file");

  const clean = run(checkout({ ".bestpractices.json": "{}\n" }), { env: { GITHUB_ACTIONS: "true" } });
  assert.ok(!/monte3l\/demo/.test(clean.stdout), "nothing-to-do names no repository");
});

// The real path, against a stub gh that records its calls: the branch, the commit through the API,
// the pull request, and the cases where it must not open one.
function real(dir, { existing = "", older = "", authors = "monte3l-sync[bot]", headMoved = false, graphql = '{"data":{"createCommitOnBranch":{"commit":{"oid":"abc"}}}}' } = {}) {
  const stubDir = mkdtempSync(path.join(tmpdir(), "bp-gh-"));
  const log = path.join(stubDir, "calls.log");
  const payload = path.join(stubDir, "graphql.json");
  writeFileSync(log, "");
  const head = headMoved ? "0".repeat(40) : git(dir, "rev-parse", "HEAD").trim();
  writeFileSync(
    path.join(stubDir, "gh"),
    `#!/usr/bin/env bash
printf '%s\\n' "$*" >>"${log}"
case "$*" in
  "api repos/monte3l/demo --jq .default_branch") echo main ;;
  "api repos/monte3l/demo/git/ref/heads/main --jq .object.sha") echo ${head} ;;
  "pr list -R monte3l/demo --head "*) printf '%s' '${existing}' ;;
  "pr list -R monte3l/demo --state open"*) printf '%s' '${older}' ;;
  "pr view "*) printf '%s' '${authors}' ;;
  "api graphql --input -") cat >"${payload}"; printf '%s' '${graphql}' ;;
  "pr create "*) echo https://github.com/monte3l/demo/pull/42 ;;
esac
`,
  );
  chmodSync(path.join(stubDir, "gh"), 0o755);
  const r = spawnSync("bash", [script, "monte3l/demo", dir], {
    encoding: "utf8",
    env: { ...process.env, PATH: `${stubDir}:${process.env.PATH}`, DRY_RUN: "0", GH_TOKEN: "t", GITHUB_ACTIONS: "" },
  });
  const calls = readFileSync(log, "utf8").split("\n").filter(Boolean);
  let sent = null;
  try {
    sent = JSON.parse(readFileSync(payload, "utf8"));
  } catch {
    // nothing was committed
  }
  return { r, calls, sent };
}

const changed = () => {
  const dir = checkout({ ".bestpractices.json": "{}\n" });
  put(dir, ".bestpractices.json", '{\n  "contribution_status": "Met"\n}\n');
  return dir;
};

test("real run: a branch, one signed commit of exactly the file, and a pull request", () => {
  const { r, calls, sent } = real(changed());
  assert.equal(r.status, 0, r.stderr);
  assert.ok(calls.some((c) => c.startsWith("api -X POST repos/monte3l/demo/git/refs")), "the branch is created");
  const input = sent.variables.input;
  assert.match(input.branch.branchName, /^chore\/bestpractices-sync-[0-9a-f]{12}$/);
  assert.equal(input.fileChanges.additions.length, 1);
  assert.equal(input.fileChanges.additions[0].path, ".bestpractices.json");
  assert.equal(Buffer.from(input.fileChanges.additions[0].contents, "base64").toString(), '{\n  "contribution_status": "Met"\n}\n');
  assert.match(input.message.body, /^Signed-off-by: monte3l-sync\[bot\] </);
  const pr = calls.find((c) => c.startsWith("pr create"));
  assert.match(pr, /--head chore\/bestpractices-sync-[0-9a-f]{12} --base main/);
  assert.match(r.stdout, /opened https:\/\/github\.com\/monte3l\/demo\/pull\/42/);
});

test("real run: a pull request for the same content, open or closed, is not opened again", () => {
  for (const existing of ["OPEN", "CLOSED", "MERGED"]) {
    const { r, calls } = real(changed(), { existing });
    assert.equal(r.status, 0, r.stderr);
    assert.ok(!calls.some((c) => c.startsWith("pr create") || c.includes("git/refs") || c.includes("graphql")), `${existing}: nothing is sent`);
  }
});

test("real run: a default branch that moved during the run stops it before anything is created", () => {
  const { r, calls } = real(changed(), { headMoved: true });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /moved while the run was working/);
  assert.ok(!calls.some((c) => c.includes("git/refs") && c.includes("POST")));
});

test("real run: a refused commit removes the branch and opens no pull request", () => {
  const { r, calls } = real(changed(), { graphql: '{"errors":[{"message":"nope"}]}' });
  assert.equal(r.status, 1);
  assert.ok(calls.some((c) => c.startsWith("api -X DELETE repos/monte3l/demo/git/refs/heads/chore/bestpractices-sync-")), "the branch is cleaned up");
  assert.ok(!calls.some((c) => c.startsWith("pr create")));
});

test("real run: an older pull request is closed only if the bot alone committed to it", () => {
  const bot = real(changed(), { older: "7\n42" });
  assert.ok(bot.calls.some((c) => c.startsWith("pr close 7 ")), "the bot's own older pull request is superseded");
  assert.ok(!bot.calls.some((c) => c.startsWith("pr close 42")), "the new one is never closed");
  const person = real(changed(), { older: "7", authors: "monte3l-sync[bot],enri3l" });
  assert.ok(!person.calls.some((c) => c.startsWith("pr close")), "a person's commits are never discarded");
  assert.match(person.r.stdout, /left #7 open/);
});
