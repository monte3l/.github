import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const guard = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.claude/hooks/guard-review-dates.mjs");
const { onlyReviewMarkerChanged } = await import(pathToFileURL(guard));

let tmp;

before(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "review-dates-"));
});
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

function run(payload) {
  return spawnSync("node", [guard], { input: JSON.stringify(payload), encoding: "utf8" });
}

const page = (date, body = "text") =>
  `---\nreviewed: ${date}\nsources:\n  - raw/x.md\n---\n\n# T\n\n**Status:** current · **Reviewed:** ${date}\n\n${body}\n`;

describe("onlyReviewMarkerChanged", () => {
  it("is true when only the frontmatter date and the visible line change", () => {
    assert.equal(onlyReviewMarkerChanged("a.md", page("2026-01-01"), page("2026-11-20")), true);
  });

  it("is true for a single marker", () => {
    assert.equal(onlyReviewMarkerChanged("a.md", "reviewed: 2026-01-01", "reviewed: 2026-11-20"), true);
    assert.equal(onlyReviewMarkerChanged("a.md", "**Reviewed:** 2026-01-01", "**Reviewed:** 2026-11-20"), true);
  });

  it("is false when other text changes too, or nothing changes", () => {
    assert.equal(onlyReviewMarkerChanged("a.md", page("2026-01-01"), page("2026-11-20", "new claim")), false);
    assert.equal(onlyReviewMarkerChanged("a.md", page("2026-01-01"), page("2026-01-01")), false);
  });

  it("ignores other dates and non-markdown files", () => {
    assert.equal(onlyReviewMarkerChanged("a.md", "released: 2026-01-01", "released: 2026-11-20"), false);
    assert.equal(onlyReviewMarkerChanged("a.txt", "reviewed: 2026-01-01", "reviewed: 2026-11-20"), false);
  });

  it("covers the reviewed value in blueprint/upstream.json only", () => {
    const a = '{ "name": "x", "reviewed": "v1" }';
    const b = '{ "name": "x", "reviewed": "v2" }';
    assert.equal(onlyReviewMarkerChanged("blueprint/upstream.json", a, b), true);
    assert.equal(onlyReviewMarkerChanged("blueprint/upstream.json", a, b.replace('"x"', '"y"')), false);
    assert.equal(onlyReviewMarkerChanged("blueprint/other.json", a, b), false);
  });
});

describe("guard-review-dates hook", () => {
  it("asks on an Edit that only bumps the date", () => {
    const r = run({
      tool_name: "Edit",
      cwd: tmp,
      tool_input: { file_path: path.join(tmp, "knowledge/wiki/x.md"), old_string: "reviewed: 2026-01-01", new_string: "reviewed: 2026-11-20" },
    });
    assert.equal(r.status, 0);
    const out = JSON.parse(r.stdout).hookSpecificOutput;
    assert.equal(out.permissionDecision, "ask");
    assert.match(out.permissionDecisionReason, /not cleared by bumping a date/);
  });

  it("passes an Edit that changes content with the date", () => {
    const r = run({
      tool_name: "Edit",
      cwd: tmp,
      tool_input: { file_path: path.join(tmp, "x.md"), old_string: "reviewed: 2026-01-01\nold", new_string: "reviewed: 2026-11-20\nnew" },
    });
    assert.equal(r.status, 0);
    assert.equal(r.stdout, "");
  });

  it("compares a Write against the file on disk", () => {
    const file = path.join(tmp, "p.md");
    fs.writeFileSync(file, page("2026-01-01"));
    const bump = run({ tool_name: "Write", cwd: tmp, tool_input: { file_path: file, content: page("2026-11-20") } });
    assert.equal(JSON.parse(bump.stdout).hookSpecificOutput.permissionDecision, "ask");
    const real = run({ tool_name: "Write", cwd: tmp, tool_input: { file_path: file, content: page("2026-11-20", "more") } });
    assert.equal(real.stdout, "");
    const fresh = run({ tool_name: "Write", cwd: tmp, tool_input: { file_path: path.join(tmp, "new.md"), content: page("2026-11-20") } });
    assert.equal(fresh.stdout, "");
  });

  it("fails open on bad input", () => {
    const r = spawnSync("node", [guard], { input: "nope", encoding: "utf8" });
    assert.equal(r.status, 0);
    assert.equal(r.stdout, "");
  });
});
