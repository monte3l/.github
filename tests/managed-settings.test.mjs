import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const settings = JSON.parse(fs.readFileSync(path.join(root, "blueprint/claude/managed-settings.json"), "utf8"));
const { deny, ask } = settings.permissions;

// The documented Bash rule syntax (code.claude.com/docs/en/permissions): `*`
// matches any text, and a trailing ` *` also matches the bare command. This is
// a model of that text, not of Claude Code itself.
function bashRule(rule) {
  const m = /^Bash\((.*)\)$/.exec(rule);
  if (!m) return null;
  let body = m[1];
  const trailing = body.endsWith(" *");
  if (trailing) body = body.slice(0, -2);
  const re = body
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${re}${trailing ? "( .*)?" : ""}$`);
}

function matches(rules, command) {
  return rules.map(bashRule).filter(Boolean).some((re) => re.test(command));
}

describe("managed settings: force-push rules", () => {
  it("denies a plain force push in every position", () => {
    for (const cmd of [
      "git push --force",
      "git push --force origin main",
      "git push origin feature --force",
      "git push origin feature --force --tags",
      "git push -f",
      "git push -f origin feature",
      "git push origin feature -f",
    ]) {
      assert.ok(matches(deny, cmd), `deny should match: ${cmd}`);
    }
  });

  it("does not deny --force-with-lease, so the ask rule can fire", () => {
    for (const cmd of [
      "git push --force-with-lease",
      "git push --force-with-lease origin feature",
      "git push origin feature --force-with-lease",
      "git push --force-with-lease=feature:abc123 origin feature",
    ]) {
      assert.ok(!matches(deny, cmd), `deny must not match: ${cmd}`);
      assert.ok(matches(ask, cmd), `ask should match: ${cmd}`);
    }
  });

  it("still denies --force-with-lease combined with a bare --force", () => {
    assert.ok(matches(deny, "git push --force-with-lease --force origin feature"));
  });

  it("leaves no ask rule that a deny rule shadows", () => {
    for (const rule of ask) {
      if (!rule.startsWith("Bash(")) continue;
      // The rule text with every `*` replaced by a word is a command it must match.
      const sample = rule.slice("Bash(".length, -1).replace(/ \*$/, "").replace(/\*/g, "x");
      if (matches(deny, sample)) {
        assert.fail(`ask rule can never fire, a deny rule matches its sample command: ${rule} (${sample})`);
      }
    }
  });
});

describe("managed settings: protected files", () => {
  it("denies edits of lockfiles and .git, which pnpm install and Dependabot write themselves", () => {
    for (const rule of ["Edit(**/pnpm-lock.yaml)", "Edit(**/package-lock.json)", "Edit(**/yarn.lock)", "Edit(**/.git/**)"]) {
      assert.ok(deny.includes(rule), `deny should list ${rule}`);
    }
  });

  it("does not deny the commands that rewrite a lockfile, and uses Edit rules, not Write ones", () => {
    for (const cmd of ["pnpm install", "pnpm install --frozen-lockfile", "npm install", "git commit -m x", "git push origin feature"]) {
      assert.ok(!matches(deny, cmd), `deny must not match: ${cmd}`);
    }
    // Claude Code matches Edit rules for Write, MultiEdit and NotebookEdit; a Write(path) rule matches nothing.
    for (const rule of deny) assert.ok(!/^(Write|MultiEdit|NotebookEdit)\(/.test(rule), `use Edit(...) instead of ${rule}`);
  });
});
