// SPDX-FileCopyrightText: Copyright (c) 2026 Enrico Lionello (enri3l) and Giulia Montevecchi (giulmonte), monte3l
// SPDX-License-Identifier: MIT

// A ratchet for `done < <(command)` in the shell scripts. Under `set -e` and `trap 'exit 3' ERR` the status
// of the substitution is lost, so a failed command ends the loop with no items and the script reports a
// clean run. blueprint/README.md, "Shell scripts", says to read the list into a variable first. These sites
// predate the rule: the test lets each script keep the ones it has and fails when one gains another. Convert
// a site to the variable form, then lower its number here.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const root = path.join(import.meta.dirname, "..");

/** Unguarded sites allowed per script. A guarded site ends its substitution in `|| true)`. */
const ALLOWED = {
  "bin/apply-repo-baseline.sh": 2,
  "bin/design-resync-pr.sh": 2,
  "bin/new-repo.sh": 3,
  "bin/pin-freshness.sh": 1,
  "bin/template-sync-pr.sh": 3,
  "bin/upstream-watch.sh": 1,
  "bin/lib/upsert-issue.sh": 1,
};

function scripts() {
  const found = [];
  for (const dir of ["bin", "bin/lib", "tests"]) {
    for (const name of readdirSync(path.join(root, dir))) {
      if (name.endsWith(".sh")) found.push(`${dir}/${name}`);
    }
  }
  return found;
}

/** Lines that read a loop or a command from `< <(...)` without `|| true)` and are not comments. */
export function unguardedSites(text) {
  return text.split("\n").filter((line) => line.includes("< <(") && !/^\s*#/.test(line) && !line.includes("|| true)"));
}

test("a script gains no new unguarded process substitution", () => {
  const over = [];
  for (const file of scripts()) {
    const count = unguardedSites(readFileSync(path.join(root, file), "utf8")).length;
    const allowed = ALLOWED[file] ?? 0;
    if (count > allowed) over.push(`${file}: ${count} unguarded \`< <(\` sites, ${allowed} allowed`);
  }
  assert.deepEqual(over, [], "read the list into a variable first (blueprint/README.md, Shell scripts), or end the substitution in `|| true)` with a comment");
});

test("the allowance names only scripts that exist, and is not larger than what is there", () => {
  const present = new Set(scripts());
  for (const [file, allowed] of Object.entries(ALLOWED)) {
    assert.ok(present.has(file), `${file} is not a script any more: remove it from ALLOWED`);
    const count = unguardedSites(readFileSync(path.join(root, file), "utf8")).length;
    assert.ok(count >= allowed, `${file} has ${count} sites and ${allowed} allowed: lower the number`);
  }
});

test("the detector separates guarded sites, comments and plain redirects", () => {
  const text = [
    'done < <(gh api x)',
    'done < <(gh api x || true)',
    '# a comment about `< <(...)`',
    'done < "$file"',
    'grep -q x < <(tr a b <<<"$v")',
  ].join("\n");
  assert.deepEqual(unguardedSites(text), ["done < <(gh api x)", 'grep -q x < <(tr a b <<<"$v")']);
});
