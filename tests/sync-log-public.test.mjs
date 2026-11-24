// SPDX-FileCopyrightText: Copyright (c) 2026 Enrico Lionello (enri3l) and Giulia Montevecchi (giulmonte), monte3l
// SPDX-License-Identifier: MIT

// The log of the template-sync `open` job is readable by anyone: this repository is public (CLAUDE.md, "counts
// only"). Behavioural ratchet: bin/template-sync-pr.sh runs in a workflow (GITHUB_ACTIONS=true) against a stub
// `gh` that puts a distinctive repository name, file path, branch, title and author into everything it prints,
// including every error, and through every path the stub can reach, the success, the existing pull request, the
// older pull request that is closed or left open, and each failure. None of those strings may reach stdout or
// stderr. The one thing the script prints on its own is the URL of the pull request it opened, which holds the
// repository name, so that line is taken out before the check. The same run by hand must still show them, which
// proves the stub would have caught a leak. A small static check backs it up: a new `$` expansion in a print
// statement has to be reviewed here.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

const root = path.join(import.meta.dirname, "..");
const script = path.join(root, "bin", "template-sync-pr.sh");

const REPO = "m3l-zzleak-repo";
const FILE = ".github/workflows/zzleak-wf.yml";
const URL_LINE = new RegExp(`^opened https://github\\.com/monte3l/${REPO}/pull/7$`, "m");
/** What must never reach a public log. The branch is `chore/template-sync-` plus a hash. */
const FORBIDDEN = ["ZZLEAK", "zzleak-wf", FILE, "chore/template-sync-", "refresh workflow copies", "refresh copies of the org", "zzleak-author", REPO];

const git = (cwd, ...args) =>
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", ...args], { cwd, encoding: "utf8" });

// A stub gh. Every message holds the whole command line, so the repository, the branch and the title are in it.
const STUB = `#!/usr/bin/env bash
args="$*"
fail() { echo "gh: $STUB_FAIL failed: ZZLEAK zzleak-wf.yml zzleak-author $args" >&2; exit 1; }
case "$args" in
  "api repos/"*"/git/ref/heads/"*) [[ "$STUB_FAIL" == base ]] && fail; printf '%s\\n' "$STUB_BASE_SHA" ;;
  "api -X DELETE "*) ;;
  "api -X POST "*) [[ "$STUB_FAIL" == ref ]] && fail; exit 0 ;;
  "api graphql"*)
    cat >/dev/null
    case "$STUB_GRAPHQL" in
      fail) fail ;;
      errors) echo '{"errors":[{"message":"ZZLEAK zzleak-wf.yml m3l-zzleak-repo chore/template-sync-"}]}' ;;
      *) echo '{"data":{"createCommitOnBranch":{"commit":{"oid":"abc"}}}}' ;;
    esac ;;
  "api repos/"*) [[ "$STUB_FAIL" == default ]] && fail; echo main ;;
  "pr list"*"--head"*) [[ "$STUB_FAIL" == existing ]] && fail; printf '%s' "$STUB_EXISTING" ;;
  "pr list"*"--author"*) if [[ -n "$STUB_OLD_PR" ]]; then printf '%s\\n' "$STUB_OLD_PR"; fi ;;
  "pr view"*) [[ "$STUB_FAIL" == view ]] && fail; printf '%s\\n' "$STUB_OLD_AUTHORS" ;;
  "pr create"*) [[ "$STUB_FAIL" == create ]] && fail; echo "https://github.com/monte3l/m3l-zzleak-repo/pull/7" ;;
  "pr close"*)
    [[ "$STUB_FAIL" == close ]] && fail
    echo "✓ Closed pull request monte3l/m3l-zzleak-repo#3 (ZZLEAK refresh workflow copies from the org templates)"
    echo "✓ Deleted branch chore/template-sync-ZZLEAK" >&2 ;;
  *) echo "unexpected: $args" >&2; exit 1 ;;
esac
`;

/**
 * A consumer checkout with a committed workflow and `after` written over it, then the script run for real (not
 * DRY_RUN) against the stub. `after` maps a path to its new text, or to { text, mode }.
 */
function run({ after = { [FILE]: "name: v2\n" }, env = {}, ci = true, dry = false } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "sync-log-"));
  git(dir, "init", "-q");
  mkdirSync(path.join(dir, ".github", "workflows"), { recursive: true });
  writeFileSync(path.join(dir, FILE), "name: v1\n");
  writeFileSync(path.join(dir, "README.md"), "# x\n");
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "base");
  for (const [rel, value] of Object.entries(after)) {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    const { text, mode } = typeof value === "string" ? { text: value } : value;
    writeFileSync(path.join(dir, rel), text);
    if (mode) chmodSync(path.join(dir, rel), mode);
  }
  const bin = mkdtempSync(path.join(tmpdir(), "stub-gh-"));
  writeFileSync(path.join(bin, "gh"), STUB);
  chmodSync(path.join(bin, "gh"), 0o755);
  const result = spawnSync("bash", [script, `monte3l/${REPO}`, dir], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      GH_TOKEN: "stub",
      GITHUB_ACTIONS: ci ? "true" : "",
      DRY_RUN: dry ? "1" : "",
      STUB_BASE_SHA: git(dir, "rev-parse", "HEAD").trim(),
      STUB_FAIL: "",
      STUB_GRAPHQL: "",
      STUB_EXISTING: "",
      STUB_OLD_PR: "",
      STUB_OLD_AUTHORS: "",
      ...env,
    },
  });
  return { status: result.status, out: result.stdout, err: result.stderr };
}

/** The text the log would carry, without the one line the script writes about the pull request it opened. */
const logOf = (r) => `${r.out.replace(URL_LINE, "")}\n${r.err}`;
const assertClean = (r, what) => {
  const log = logOf(r);
  for (const forbidden of FORBIDDEN) assert.ok(!log.includes(forbidden), `${what}: the log names "${forbidden}":\n${log}`);
};

const BOT = "monte3l-sync[bot]";

test("the success path opens a pull request and closes an older one of the bot, and says neither which file nor which branch", () => {
  const r = run({ env: { STUB_OLD_PR: "3", STUB_OLD_AUTHORS: BOT } });
  assert.equal(r.status, 0, r.err);
  assert.match(r.out, URL_LINE, "the script prints the URL of the pull request itself");
  assert.match(r.out, /^1 file\(s\), \d+ bytes$/m);
  assert.match(r.out, /closed an older pull request/);
  assertClean(r, "success");
});

test("an older pull request with a human's commits is left open without naming the human", () => {
  const r = run({ env: { STUB_OLD_PR: "3", STUB_OLD_AUTHORS: "zzleak-author" } });
  assert.equal(r.status, 0, r.err);
  assert.match(r.out, /left an older pull request open/);
  assertClean(r, "left open");
});

test("an existing pull request for the same files is reported without the repository", () => {
  const r = run({ env: { STUB_EXISTING: "MERGED" } });
  assert.equal(r.status, 0, r.err);
  assert.match(r.out, /a pull request for these files already exists \(MERGED\)/);
  assertClean(r, "existing");
});

test("nothing to do is reported without the repository", () => {
  const r = run({ after: {} });
  assert.equal(r.status, 0, r.err);
  assert.equal(r.out, "every copy is current: nothing to do\n");
});

test("a dry run in a workflow says nothing about the files, the branch or the diff", () => {
  const r = run({ dry: true });
  assert.equal(r.status, 0, r.err);
  assertClean(r, "dry run");
});

// Every failure, each with the stub putting its own text into the message.
const FAILURES = [
  ["the default branch cannot be read", { STUB_FAIL: "default" }],
  ["the base commit cannot be read", { STUB_FAIL: "base" }],
  ["the existing pull request cannot be listed", { STUB_FAIL: "existing" }],
  ["the branch cannot be created", { STUB_FAIL: "ref" }],
  ["the commit call fails", { STUB_GRAPHQL: "fail" }],
  ["the commit call answers with errors", { STUB_GRAPHQL: "errors" }],
  ["the pull request cannot be created", { STUB_FAIL: "create" }],
  ["an older pull request cannot be read", { STUB_OLD_PR: "3", STUB_OLD_AUTHORS: BOT, STUB_FAIL: "view" }],
  ["an older pull request cannot be closed", { STUB_OLD_PR: "3", STUB_OLD_AUTHORS: BOT, STUB_FAIL: "close" }],
];
for (const [what, env] of FAILURES) {
  test(`in a workflow, when ${what}, the log says it failed and names nothing`, () => {
    const r = run({ env });
    assert.notEqual(r.status, 0, "the run fails");
    assert.match(logOf(r), /error: .+/, "and says so");
    assertClean(r, what);
  });
}

// A change set the script refuses: it says how many, never which.
test("in a workflow a path that is not allowed is counted, not named", () => {
  const r = run({ after: { [FILE]: "name: v2\n", "zzleak-other/secret.txt": "x\n" } });
  assert.notEqual(r.status, 0);
  assert.match(r.err, /1 change\(s\) are neither a workflow file nor a starter/);
  assertClean(r, "not allowed");
});

test("in a workflow a file that is added, not modified, is counted, not named", () => {
  const r = run({ after: { [FILE]: "name: v2\n", ".github/workflows/zzleak-new.yml": "name: n\n" } });
  assert.notEqual(r.status, 0);
  assert.match(r.err, /only modifies existing files, got 1 that are not/);
  assertClean(r, "added");
});

test("in a workflow a file that is not a plain file is counted, not named", () => {
  const r = run({ after: { [FILE]: { text: "name: v2\n", mode: 0o755 } } });
  assert.notEqual(r.status, 0);
  assert.match(r.err, /1 file\(s\) are not plain 100644 files/);
  assertClean(r, "mode");
});

// By hand the detail is there: the stub's text does reach the log, so the checks above could have failed.
test("by hand the same failures show the repository, the file, the branch and the message", () => {
  const graphql = run({ ci: false, env: { STUB_GRAPHQL: "fail" } });
  assert.notEqual(graphql.status, 0);
  assert.match(graphql.err, /ZZLEAK/, "gh's own message");
  assert.match(graphql.err, /could not commit to chore\/template-sync-/);
  const other = run({ ci: false, after: { [FILE]: "name: v2\n", "zzleak-other/secret.txt": "x\n" } });
  assert.match(other.err, /zzleak-other\/secret\.txt/);
  const ok = run({ ci: false, env: { STUB_OLD_PR: "3", STUB_OLD_AUTHORS: BOT } });
  assert.equal(ok.status, 0, ok.err);
  assert.match(ok.out, new RegExp(`monte3l/${REPO}: 1 file\\(s\\), \\d+ bytes: ${FILE.replaceAll(".", "\\.")}`));
  assert.match(ok.out, /ZZLEAK/, "gh pr close's own report");
});

// A backstop for what the stub cannot reach. A `$` expansion in a statement that prints is either reviewed here
// as safe in a public log, or it is by-hand only and must sit in the `else` of the `$ci` check (or follow an
// `if [[ "$ci" == 1 ]]` that ends in its own message). A new expansion fails this test until it is placed.
const lines = readFileSync(script, "utf8").split("\n");
const PRINTS = /\b(printf|echo|cat|tee|die)\b|>&2/;
/** Safe in a public log: constants, counts, the URL the script prints itself, and gh's stderr only under `$ci`. */
const SAFE = new Set([
  "${0##*/}", "$*", "$@", "$dir", "$ci", "$total", "$max_bytes", "${#files[@]}", "$url", "$existing", "$prefix", "$default", "$base",
  "$(git rev-parse HEAD)", "$(wc -w <<<\"$other\" | tr -d ' ')", "$(wc -l <<<\"$nonmod\" | tr -d ' ')", "$(wc -l <<<\"$bad_mode\" | tr -d ' ')",
  "$(jq '.errors | length' \"$work/commit.json\")", "$(printf '%s' \"$fingerprint\" | git hash-object --stdin | cut -c1-12)", "$work",
]);
// The usage error names the argument it was given, before anything runs: it is not a repository the sync found.
const ARGUMENT_ERROR = /is not a monte3l repository/;
// The body of the pull request is public in the other repository, not a log.
const PR_BODY = /for path in "\$\{files\[@\]\}"; do printf/;

test("every expansion in a print statement is reviewed as safe, or sits on the by-hand side of the $ci check", () => {
  let scanned = 0;
  lines.forEach((line, i) => {
    if (line.trim().startsWith("#") || !PRINTS.test(line) || PR_BODY.test(line) || ARGUMENT_ERROR.test(line)) return;
    const expansions = [...line.matchAll(/\$(?:\{[^}]*\}|\((?:[^()]|\([^()]*\))*\)|[A-Za-z_]\w*|\*|@)/g)].map((m) => m[0]);
    const unreviewed = expansions.filter((e) => !SAFE.has(e));
    if (unreviewed.length === 0) return;
    scanned++;
    const before = lines.slice(Math.max(0, i - 9), i).map((l) => l.trim());
    const oneLiner = /\$ci" == 1 \]\]; then .*; else /.test(line);
    const afterElse = before.includes("else");
    const afterCiMessage = before.slice(-4).some((l) => /if \[\[ "\$ci" == 1 \]\]; then/.test(l));
    assert.ok(oneLiner || afterElse || afterCiMessage, `line ${i + 1} prints ${unreviewed.join(" ")} outside the by-hand side of $ci: ${line.trim()}`);
  });
  assert.ok(scanned >= 8, "the scan found the by-hand lines: the patterns are stale");
});

test("template-sync.mjs decides what an error says from GITHUB_ACTIONS in one place", () => {
  const text = readFileSync(path.join(root, "bin", "template-sync.mjs"), "utf8");
  assert.equal((text.match(/process\.env\.GITHUB_ACTIONS/g) ?? []).length, 1, "one decision, not several");
  assert.match(text, /const redact = publicOutput \|\| inCi;/);
});
