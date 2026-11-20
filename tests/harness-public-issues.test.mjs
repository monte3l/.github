import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const guard = path.join(root, ".claude/hooks/guard-public-issues.mjs");
const verifyEdit = path.join(root, ".claude/hooks/verify-edit.sh");

let tmp;
let publicRepo; // origin monte3l/.github
let otherRepo; // origin monte3l/m3l-design

function sh(cwd, ...args) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
}

function makeRepo(name, origin) {
  const dir = path.join(tmp, name);
  fs.mkdirSync(path.join(dir, "blueprint"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "blueprint/projects.json"),
    JSON.stringify([{ repo: "m3l-design" }, { repo: "m3l-plugins" }, { repo: ".github" }]),
  );
  sh(dir, "init", "-q", "-b", "main");
  sh(dir, "remote", "add", "origin", origin);
  return dir;
}

function run(command, cwd) {
  return spawnSync("node", [guard], { input: JSON.stringify({ tool_name: "Bash", cwd, tool_input: { command } }), encoding: "utf8" });
}

before(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "public-issues-")));
  publicRepo = makeRepo("pub", "git@github.com:monte3l/.github.git");
  otherRepo = makeRepo("other", "https://github.com/monte3l/m3l-design.git");
});
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe("guard-public-issues", () => {
  it("denies a per-repository DRIFT line in the public repository", () => {
    const r = run(`gh issue create --title "Org drift" --body "DRIFT  docs site: parity (m3l-design)"`, publicRepo);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /counts only/);
  });

  it("reads the body from --body-file", () => {
    fs.writeFileSync(path.join(publicRepo, "body.md"), "Summary\n\n  DRIFT  release pin age\n  m3l-plugins is behind\n");
    const r = run("gh pr comment 5 --body-file body.md", publicRepo);
    assert.equal(r.status, 2);
  });

  it("follows -R to the public repository from another checkout", () => {
    const r = run(`gh issue comment 3 -R monte3l/.github --body "DRIFT m3l-design"`, otherRepo);
    assert.equal(r.status, 2);
  });

  it("allows counts, and a DRIFT line that names no repository", () => {
    assert.equal(run(`gh issue create --title t --body "3 repositories drift in 2 items"`, publicRepo).status, 0);
    assert.equal(run(`gh issue create --title t --body "DRIFT  docs site: parity"`, publicRepo).status, 0);
  });

  it("allows a per-repository DRIFT line in a private target", () => {
    const r = run(`gh pr comment 2 --body "DRIFT  docs site: parity (m3l-design)"`, otherRepo);
    assert.equal(r.status, 0);
    assert.equal(r.stdout, "");
  });

  it("asks on vulnerability wording", () => {
    for (const body of ["found a vulnerability in the deploy step", "CVE-2026-12345 affects wrangler", "working exploit attached"]) {
      const r = run(`gh issue create --title t --body "${body}"`, otherRepo);
      assert.equal(r.status, 0, body);
      assert.equal(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision, "ask", body);
    }
  });

  it("ignores commands that do not publish text", () => {
    for (const c of ["gh issue list --search vulnerability", "gh pr view 5", "git commit -m 'exploit docs'", "echo DRIFT m3l-design"]) {
      const r = run(c, publicRepo);
      assert.equal(r.status, 0, c);
      assert.equal(r.stdout, "", c);
    }
  });

  it("fails open on bad input and for other tools", () => {
    assert.equal(spawnSync("node", [guard], { input: "nope", encoding: "utf8" }).status, 0);
    const r = spawnSync("node", [guard], { input: JSON.stringify({ tool_name: "Edit", tool_input: {} }), encoding: "utf8" });
    assert.equal(r.status, 0);
  });
});

describe("verify-edit.sh on ROADMAP.md", () => {
  const edit = (file) =>
    spawnSync("bash", [verifyEdit], { input: JSON.stringify({ tool_input: { file_path: file } }), encoding: "utf8", cwd: root });

  const good = `---\nreviewed: 2026-11-20\n---\n\n# Roadmap\n\n## Now\n\n## Next 12 months\n\n## Known limits\n\n## Unverified\n\n## What this project will not do\n`;

  it("passes a ROADMAP that follows the policy and fails one that does not", () => {
    // The hook finds bin/lib/roadmap.mjs through the file's own repository, so put the file in this checkout.
    const dir = fs.mkdtempSync(path.join(root, ".tmp-roadmap-"));
    try {
      fs.writeFileSync(path.join(dir, "ROADMAP.md"), good);
      assert.equal(edit(path.join(dir, "ROADMAP.md")).status, 0);
      fs.writeFileSync(path.join(dir, "ROADMAP.md"), good.replace("## Known limits\n\n", ""));
      const bad = edit(path.join(dir, "ROADMAP.md"));
      assert.equal(bad.status, 2);
      assert.match(bad.stderr, /does not follow blueprint\/tracking\.md/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("never runs a parser that ships with the edited file's own repository", () => {
    // A foreign checkout with its own bin/lib/roadmap.mjs: if the hook ran it, it would leave a marker.
    const foreign = fs.mkdtempSync(path.join(os.tmpdir(), "foreign-"));
    try {
      sh(foreign, "init", "-q", "-b", "main");
      fs.mkdirSync(path.join(foreign, "bin/lib"), { recursive: true });
      const marker = path.join(foreign, "RAN");
      fs.writeFileSync(
        path.join(foreign, "bin/lib/roadmap.mjs"),
        `import fs from "node:fs"; fs.writeFileSync(${JSON.stringify(marker)}, "x"); process.exit(1);\n`,
      );
      fs.writeFileSync(path.join(foreign, "ROADMAP.md"), "not a roadmap\n");
      edit(path.join(foreign, "ROADMAP.md"));
      assert.equal(fs.existsSync(marker), false, "the foreign parser must not run");
    } finally {
      fs.rmSync(foreign, { recursive: true, force: true });
    }
  });

  it("leaves the starter in blueprint/files alone, placeholders included", () => {
    const starter = path.join(root, "blueprint/files/ROADMAP.md");
    assert.ok(fs.existsSync(starter));
    assert.equal(edit(starter).status, 0);
  });
});
