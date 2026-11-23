import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// `import.meta.url` is symlink-resolved and percent-encoded; `process.argv[1]`
// is neither. A string comparison between them is false under a symlinked or
// spaced path, so a hook never runs and exits 0, which means "allow".
const NAIVE = [/import\.meta\.url\s*===?\s*`file:\/\/\$\{\s*process\.argv\[1\]\s*\}`/, /pathToFileURL\(\s*process\.argv\[1\]\s*\)/];

function scripts(dir) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!["node_modules", "source", ".git", "worktrees"].includes(entry.name)) found.push(...scripts(full));
    } else if (entry.name.endsWith(".mjs")) found.push(full);
  }
  return found;
}

describe("entry-point checks", () => {
  it("no hook or script compares import.meta.url with argv[1] as strings", () => {
    const offenders = [];
    for (const dir of [".claude/hooks", "bin"]) {
      for (const file of scripts(path.join(root, dir))) {
        const text = fs.readFileSync(file, "utf8");
        if (NAIVE.some((re) => re.test(text))) offenders.push(path.relative(root, file));
      }
    }
    assert.deepEqual(offenders, [], "use realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)");
  });
});

describe("hooks still run under a symlinked or spaced path", () => {
  let tmp;
  let linkDir;
  let spacedDir;

  before(() => {
    tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "entry-point-")));
    linkDir = path.join(tmp, "linked-hooks");
    fs.symlinkSync(path.join(root, ".claude/hooks"), linkDir);
    spacedDir = path.join(tmp, "with space");
    fs.mkdirSync(spacedDir);
    for (const name of ["guard-review-dates.mjs"]) fs.copyFileSync(path.join(root, ".claude/hooks", name), path.join(spacedDir, name));
  });
  after(() => fs.rmSync(tmp, { recursive: true, force: true }));

  // A bump of a `reviewed:` date alone makes guard-review-dates answer "ask".
  const payload = {
    tool_name: "Edit",
    cwd: root,
    tool_input: {
      file_path: path.join(root, "knowledge/wiki/example.md"),
      old_string: "---\nreviewed: 2026-01-01\n---\n",
      new_string: "---\nreviewed: 2026-11-23\n---\n",
    },
  };
  const run = (script) => spawnSync("node", [script], { input: JSON.stringify(payload), encoding: "utf8" });

  it("guard-review-dates asks when run directly", () => {
    const r = run(path.join(root, ".claude/hooks/guard-review-dates.mjs"));
    assert.match(r.stdout, /"permissionDecision":\s*"ask"/);
  });

  it("guard-review-dates asks when run through a symlinked directory", () => {
    const r = run(path.join(linkDir, "guard-review-dates.mjs"));
    assert.match(r.stdout, /"permissionDecision":\s*"ask"/);
  });

  it("guard-review-dates asks when its path has a space", () => {
    const r = run(path.join(spacedDir, "guard-review-dates.mjs"));
    assert.match(r.stdout, /"permissionDecision":\s*"ask"/);
  });

  it("roadmap.mjs reports a bad ROADMAP through a symlinked path", () => {
    const link = path.join(tmp, "roadmap-link.mjs");
    fs.symlinkSync(path.join(root, "bin/lib/roadmap.mjs"), link);
    // The sibling import resolves from the real file, so the link may sit anywhere.
    const r = spawnSync("node", [link], { input: "# not a roadmap\n", encoding: "utf8" });
    assert.equal(r.status, 1, r.stderr);
    assert.notEqual(r.stdout.trim(), "");
  });
});
