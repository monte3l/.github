// SPDX-FileCopyrightText: Copyright (c) 2026 Enrico Lionello (enri3l) and Giulia Montevecchi (giulmonte), monte3l
// SPDX-License-Identifier: MIT

// bin/template-sync.mjs end to end, for starters: the real CLI and library run in a throwaway git repository
// (the CLI reads the history of the files next to it, so it cannot be pointed at another one) against a stub
// `gh` that serves a consumer's files. Nothing here talks to GitHub.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

const root = path.join(import.meta.dirname, "..");
const V1 = "# x v1\nk = 1\n";
const V2 = "# x v2\nk = 2\n";
const WORKFLOW = "name: t\njobs:\n  a:\n    name: A\n";

const git = (cwd, ...args) =>
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", ...args], { cwd, encoding: "utf8" });
const put = (dir, rel, text) => {
  mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  writeFileSync(path.join(dir, rel), text);
};

/**
 * A repository holding the real CLI, a minimal sync.json and two versions of the starter x.toml, and a
 * consumer directory the stub gh serves.
 * @param {{ starters?: object, repo?: object, consumer: Record<string, string>, yOld?: string }} options
 *   `yOld` gives the starter y.cfg an older version too (it has one version, "y\n", otherwise)
 */
function setup({ starters, repo = { flags: [] }, consumer, yOld }) {
  const dir = mkdtempSync(path.join(tmpdir(), "sync-cli-"));
  git(dir, "init", "-q");
  mkdirSync(path.join(dir, "bin", "lib"), { recursive: true });
  cpSync(path.join(root, "bin", "template-sync.mjs"), path.join(dir, "bin", "template-sync.mjs"));
  cpSync(path.join(root, "bin", "lib", "template-sync.mjs"), path.join(dir, "bin", "lib", "template-sync.mjs"));
  put(dir, "workflow-templates/t.yml", WORKFLOW);
  put(dir, "blueprint/projects.json", JSON.stringify([{ repo: "m3l-x", site: "https://x.monte3l.com" }]));
  put(dir, "blueprint/files/y.cfg", yOld ?? "y\n");
  put(dir, "blueprint/files/x.toml", V1);
  const config = {
    flags: {},
    templates: { t: "managed" },
    starters: starters ?? {
      "x.toml": { mode: "managed", paths: [".x.toml", "conf/x.toml"] },
      "y.cfg": { mode: "managed", paths: [".y"] },
    },
    repos: { "m3l-x": repo },
  };
  put(dir, "blueprint/sync.json", JSON.stringify(config));
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "v1");
  put(dir, "blueprint/files/x.toml", V2);
  if (yOld !== undefined) put(dir, "blueprint/files/y.cfg", "y\n");
  git(dir, "commit", "-q", "-am", "v2");

  // The consumer's files, and a gh that serves them: a missing file is the 404 the CLI expects.
  const served = path.join(dir, "served");
  for (const [rel, text] of Object.entries(consumer)) put(served, rel, text);
  const bin = path.join(dir, "stubbin");
  mkdirSync(bin);
  writeFileSync(
    path.join(bin, "gh"),
    `#!/usr/bin/env bash
[[ "$1" == "--version" ]] && { echo "gh version stub"; exit 0; }
case "$2" in
  repos/monte3l/m3l-x) printf '{"private":false,"archived":false}' ;;
  repos/monte3l/m3l-x/contents/*)
    file=${JSON.stringify(served)}/"\${2#repos/monte3l/m3l-x/contents/}"
    if [[ -f "$file" ]]; then base64 <"$file"; else echo "gh: Not Found (HTTP 404)" >&2; exit 1; fi ;;
  *) echo "unexpected: $*" >&2; exit 1 ;;
esac
`,
  );
  chmodSync(path.join(bin, "gh"), 0o755);
  return { dir, bin };
}

function runSync({ dir, bin }, ...args) {
  const out = path.join(dir, "out");
  const findings = path.join(dir, "findings.txt");
  const result = spawnSync("node", [path.join(dir, "bin", "template-sync.mjs"), "--repos", "m3l-x", "--findings", findings, ...args.map((a) => (a === "OUT" ? out : a))], {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
  });
  return { status: result.status, out: result.stdout, err: result.stderr, written: (rel) => (existsSync(path.join(out, rel)) ? readFileSync(path.join(out, rel), "utf8") : null), findings: existsSync(findings) ? readFileSync(findings, "utf8") : null };
}

test("a stale starter is found at the second candidate path, reported, and written there", () => {
  const env = setup({ consumer: { ".github/workflows/t.yml": WORKFLOW, "conf/x.toml": V1 } });
  const r = runSync(env, "--write", "OUT");
  assert.equal(r.status, 0, r.err);
  assert.equal(r.written("conf/x.toml"), V2, "the current starter is written where the repository keeps it");
  assert.equal(r.written(".x.toml"), null, "not at the first candidate, which the repository does not have");
  assert.equal(r.findings, "m3l-x: conf/x.toml is 1 version behind its starter\n");
});

test("a custom starter is never written or reported", () => {
  const env = setup({ consumer: { ".github/workflows/t.yml": WORKFLOW, ".x.toml": `${V1}extra = true\n`, ".y": "mine\n" } });
  const r = runSync(env, "--write", "OUT");
  assert.equal(r.status, 0, r.err);
  assert.equal(r.written(".x.toml"), null);
  assert.equal(r.written(".y"), null);
  assert.equal(r.findings, "");
});

test("a current starter and a missing starter produce nothing", () => {
  const env = setup({ consumer: { ".github/workflows/t.yml": WORKFLOW, ".x.toml": V2 } });
  const r = runSync(env, "--write", "OUT");
  assert.equal(r.status, 0, r.err);
  assert.equal(r.written(".x.toml"), null);
  assert.equal(r.findings, "");
});

test("an unmanaged starter is shown but never written, even when stale", () => {
  const env = setup({
    starters: { "x.toml": { mode: "unmanaged", paths: [".x.toml"] } },
    consumer: { ".github/workflows/t.yml": WORKFLOW, ".x.toml": V1 },
  });
  const r = runSync(env, "--write", "OUT");
  assert.equal(r.status, 0, r.err);
  assert.equal(r.written(".x.toml"), null);
  assert.equal(r.findings, "");
  assert.match(r.out, /x\.toml\s+S1\*/, "shown as stale, marked unmanaged");
});

test("a path in sync.json that leaves the repository stops the run", () => {
  for (const bad of ["../evil", "/etc/evil"]) {
    const env = setup({ starters: { "x.toml": { mode: "managed", paths: [bad] } }, consumer: { ".github/workflows/t.yml": WORKFLOW } });
    const r = runSync(env, "--write", "OUT");
    assert.equal(r.status, 2, bad);
    assert.match(r.err, /not a relative path inside the repository/);
    assert.equal(r.written("evil"), null);
  }
});

test("a repository path replaces the starter's candidates", () => {
  const env = setup({ repo: { flags: [], paths: { "x.toml": "own/x.toml" } }, consumer: { ".github/workflows/t.yml": WORKFLOW, ".x.toml": V1, "own/x.toml": V1 } });
  const r = runSync(env, "--write", "OUT");
  assert.equal(r.status, 0, r.err);
  assert.equal(r.written("own/x.toml"), V2);
  assert.equal(r.written(".x.toml"), null, "the default path is not looked at once the repository names its own");
});

test("a starter listed in sync.json but missing from blueprint/files stops the run", () => {
  const env = setup({ starters: { "gone.toml": { mode: "managed", paths: [".g"] } }, consumer: { ".github/workflows/t.yml": WORKFLOW } });
  const r = runSync(env);
  assert.equal(r.status, 2);
  assert.match(r.err, /not in blueprint\/files/);
});

test("a stale starter that carries its own SPDX header is refreshed and keeps that header", () => {
  const header = "# SPDX-FileCopyrightText: 2026 someone\n# SPDX-License-Identifier: MIT\n";
  const env = setup({ consumer: { ".github/workflows/t.yml": WORKFLOW, "conf/x.toml": `${header}\n${V1}` } });
  const r = runSync(env, "--write", "OUT");
  assert.equal(r.status, 0, r.err);
  assert.equal(r.written("conf/x.toml"), `${header}\n${V2}`, "the template text, under the repository's own header and spacing");
  assert.equal(r.findings, "m3l-x: conf/x.toml is 1 version behind its starter\n");
});

test("a refreshed starter is not stale on the next run, so the sync does not open the same pull request twice", () => {
  const header = "# SPDX-FileCopyrightText: 2026 someone\n";
  const first = setup({ consumer: { ".github/workflows/t.yml": WORKFLOW, "conf/x.toml": `${header}${V1}` } });
  const written = runSync(first, "--write", "OUT").written("conf/x.toml");
  assert.equal(written, `${header}${V2}`);
  const second = setup({ consumer: { ".github/workflows/t.yml": WORKFLOW, "conf/x.toml": written } });
  const r = runSync(second, "--write", "OUT");
  assert.equal(r.status, 0, r.err);
  assert.equal(r.written("conf/x.toml"), null);
  assert.equal(r.findings, "");
});

test("a stale starter with no header gets none", () => {
  const env = setup({ consumer: { ".github/workflows/t.yml": WORKFLOW, "conf/x.toml": V1 } });
  assert.equal(runSync(env, "--write", "OUT").written("conf/x.toml"), V2);
});

// The push guard and its helper are one unit: sync.json `requires` lets a guard be refreshed only beside a helper it can use.
const PAIR = {
  "x.toml": { mode: "managed", paths: [".x.toml"], requires: ["y.cfg"] },
  "y.cfg": { mode: "managed", paths: [".y"] },
};

test("a stale starter beside a custom starter it requires is held: not written, and the finding says why", () => {
  const env = setup({ starters: PAIR, consumer: { ".github/workflows/t.yml": WORKFLOW, ".x.toml": V1, ".y": "mine\n" } });
  const r = runSync(env, "--write", "OUT");
  assert.equal(r.status, 0, r.err);
  assert.equal(r.written(".x.toml"), null, "the guard is not refreshed beside a helper that is the repository's own");
  assert.equal(r.written(".y"), null);
  assert.equal(r.findings, "m3l-x: .x.toml is 1 version behind its starter, but is not refreshed: .y is custom. Refresh the pair together by hand\n");
  assert.match(r.out, /x\.toml\s+H1/, "shown as held, one version behind");
});

test("a stale starter whose required starter is missing is held too", () => {
  const env = setup({ starters: PAIR, consumer: { ".github/workflows/t.yml": WORKFLOW, ".x.toml": V1 } });
  const r = runSync(env, "--write", "OUT");
  assert.equal(r.written(".x.toml"), null);
  assert.match(r.findings, /not refreshed: \.y is missing/);
});

test("a stale starter beside a current starter it requires is refreshed", () => {
  const env = setup({ starters: PAIR, consumer: { ".github/workflows/t.yml": WORKFLOW, ".x.toml": V1, ".y": "y\n" } });
  const r = runSync(env, "--write", "OUT");
  assert.equal(r.status, 0, r.err);
  assert.equal(r.written(".x.toml"), V2);
  assert.equal(r.findings, "m3l-x: .x.toml is 1 version behind its starter\n");
});

test("a required starter kept at its second allowed path counts as present, and is refreshed there", () => {
  const starters = {
    "x.toml": { mode: "managed", paths: [".x.toml"], requires: ["y.cfg"] },
    "y.cfg": { mode: "managed", paths: [".y", "lib/.y"] },
  };
  const env = setup({ starters, yOld: "y0\n", consumer: { ".github/workflows/t.yml": WORKFLOW, ".x.toml": V1, "lib/.y": "y0\n" } });
  const r = runSync(env, "--write", "OUT");
  assert.equal(r.status, 0, r.err);
  assert.equal(r.written(".x.toml"), V2, "the guard is not held: its helper is at the second path");
  assert.equal(r.written("lib/.y"), "y\n");
  assert.equal(r.written(".y"), null, "nothing is written to the first path");
});

test("both stale: the pair is refreshed together", () => {
  const env = setup({ starters: PAIR, yOld: "y0\n", consumer: { ".github/workflows/t.yml": WORKFLOW, ".x.toml": V1, ".y": "y0\n" } });
  const r = runSync(env, "--write", "OUT");
  assert.equal(r.status, 0, r.err);
  assert.equal(r.written(".x.toml"), V2);
  assert.equal(r.written(".y"), "y\n");
  assert.equal(r.findings, "m3l-x: .x.toml is 1 version behind its starter\nm3l-x: .y is 1 version behind its starter\n");
});

test("the helper alone may be refreshed beside a guard that is current or custom", () => {
  const env = setup({ starters: PAIR, yOld: "y0\n", consumer: { ".github/workflows/t.yml": WORKFLOW, ".x.toml": `${V2}extra = true\n`, ".y": "y0\n" } });
  const r = runSync(env, "--write", "OUT");
  assert.equal(r.written(".y"), "y\n");
  assert.equal(r.written(".x.toml"), null);
});

test("a repository that skips a starter: nothing is read, written or reported for it", () => {
  const env = setup({ repo: { flags: [], skip: ["x.toml"] }, consumer: { ".github/workflows/t.yml": WORKFLOW, ".x.toml": V1, ".y": "y\n" } });
  const r = runSync(env, "--write", "OUT");
  assert.equal(r.status, 0, r.err);
  assert.equal(r.written(".x.toml"), null);
  assert.equal(r.findings, "");
  assert.match(r.out, /x\.toml\s+skip/);
});

test("a skipped required starter holds the one that needs it", () => {
  const env = setup({ starters: PAIR, repo: { flags: [], skip: ["y.cfg"] }, consumer: { ".github/workflows/t.yml": WORKFLOW, ".x.toml": V1, ".y": "y\n" } });
  const r = runSync(env, "--write", "OUT");
  assert.equal(r.written(".x.toml"), null);
  assert.match(r.findings, /not refreshed: \.y is skipped/);
});

// The public repository's issue, job summary and logs are readable by anyone, so what freshness.yml publishes is
// counts only: --public prints and writes how many, never which repository or which file.
test("--public prints and writes counts only: no repository, no file, no table", () => {
  const env = setup({ consumer: { ".github/workflows/t.yml": WORKFLOW, ".x.toml": V1, ".y": "y\n" } });
  const r = runSync(env, "--public", "--check");
  assert.equal(r.status, 1, "a finding still exits 1 with --check");
  assert.equal(r.findings, "1 copy is behind its template or starter, in 1 repository.\n");
  for (const text of [r.out, r.findings]) {
    assert.doesNotMatch(text, /m3l-x|x\.toml|\.x\.toml|\.y\b|t\.yml/, "no repository or file name");
    assert.doesNotMatch(text, /^template\s/m, "no table with a column per repository");
  }
  assert.match(r.out, /managed copies: IDENTICAL 2, STALE 1/);
  assert.match(r.out, /findings:\n {2}1 copy is behind its template or starter, in 1 repository\./);
});

test("--public counts a held copy, and says nothing when there is nothing to report", () => {
  const held = setup({ starters: PAIR, consumer: { ".github/workflows/t.yml": WORKFLOW, ".x.toml": V1, ".y": "mine\n" } });
  const h = runSync(held, "--public");
  assert.equal(h.findings, "1 copy is behind its template or starter, in 1 repository.\n1 of them is held back until a helper it needs is refreshed.\n");
  assert.doesNotMatch(h.findings + h.out, /m3l-x|\.x\.toml|\.y\b/);

  const clean = setup({ consumer: { ".github/workflows/t.yml": WORKFLOW, ".x.toml": V2, ".y": "y\n" } });
  const c = runSync(clean, "--public", "--check");
  assert.equal(c.status, 0);
  assert.equal(c.findings, "");
  assert.match(c.out, /findings: none/);
});

test("--public counts a flag that disagrees with docs.config.mjs without naming the repository", () => {
  const env = setup({ repo: { flags: ["manifest"] }, consumer: { ".github/workflows/t.yml": WORKFLOW, ".x.toml": V2, ".y": "y\n", "docs.config.mjs": "export default {};\n" } });
  const r = runSync(env, "--public");
  assert.equal(r.findings, "1 repository has a flag that disagrees with its docs.config.mjs.\n");
  assert.doesNotMatch(r.findings + r.out, /m3l-x|manifest/);
});

test("--public refuses --json and --write, which carry names", () => {
  const env = setup({ consumer: { ".github/workflows/t.yml": WORKFLOW, ".x.toml": V1, ".y": "y\n" } });
  for (const flag of ["--json", "--write"]) {
    const r = runSync(env, "--public", flag, ...(flag === "--write" ? ["OUT"] : []));
    assert.equal(r.status, 2, flag);
    assert.match(r.err, /counts only/);
  }
});

test("--public leaves the repository out of a failure, and a plain run still names it", () => {
  const env = setup({ consumer: { ".github/workflows/t.yml": WORKFLOW, ".x.toml": V1, ".y": "y\n" } });
  // A gh that says the repository is private, and fails every other call with a message that holds its path.
  writeFileSync(
    path.join(env.bin, "gh"),
    `#!/usr/bin/env bash
[[ "$1" == "--version" ]] && { echo "gh version stub"; exit 0; }
case "$2" in
  repos/monte3l/m3l-x) printf '{"private":true,"archived":false}' ;;
  *) echo "gh: repos/monte3l/m3l-x/contents/x failed (HTTP 500)" >&2; exit 1 ;;
esac
`,
  );
  const publicRun = runSync(env, "--public");
  assert.equal(publicRun.status, 3);
  assert.match(publicRun.err, /a repository is private/);
  assert.doesNotMatch(publicRun.err, /m3l-x/, "no repository name on the public run page");
  const plain = runSync(env);
  assert.equal(plain.status, 3);
  assert.match(plain.err, /monte3l\/m3l-x is private/);

  writeFileSync(
    path.join(env.bin, "gh"),
    `#!/usr/bin/env bash
[[ "$1" == "--version" ]] && { echo "gh version stub"; exit 0; }
case "$2" in
  repos/monte3l/m3l-x) printf '{"private":false,"archived":false}' ;;
  *) echo "gh: repos/monte3l/m3l-x/contents/x failed (HTTP 500)" >&2; exit 1 ;;
esac
`,
  );
  const failed = runSync(env, "--public");
  assert.equal(failed.status, 3);
  assert.match(failed.err, /a read failed \(run without --public/);
  assert.doesNotMatch(failed.err, /m3l-x/);
});
