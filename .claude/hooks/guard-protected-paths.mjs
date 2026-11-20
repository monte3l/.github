#!/usr/bin/env node
/**
 * PreToolUse guard (Write|Edit): protects files that are copied or generated,
 * never hand-edited.
 *
 *  - `design/source/**`, `design/tokens.css` and `design/SHA256SUMS` are a
 *    verbatim copy of an m3l-design release; `design/SHA256SUMS` is checked
 *    against them by the docs build, so a hand edit fails it.
 *  - `_site/**` is the docs-kit build output.
 *
 * `design/README.md` and `design/local/**` are the repo's own and stay
 * writable. Re-sync the vendored copy with `bin/sync-design.sh vX.Y.Z <repo>`
 * from an m3l-design checkout; it writes through the shell, not Edit/Write, so
 * this guard does not get in its way.
 *
 * Blocks by exiting 2 with a message on stderr.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const PROTECTED = [
  {
    test: (p) =>
      p === "design/source" ||
      p.startsWith("design/source/") ||
      p === "design/tokens.css" ||
      p === "design/SHA256SUMS",
    why: "is a verbatim copy of an m3l-design release. Re-sync it with `bin/sync-design.sh vX.Y.Z <repo>` from an m3l-design checkout (and fix the problem upstream) instead of editing it here.",
  },
  {
    test: (p) => p === "_site" || p.startsWith("_site/"),
    why: "is docs-kit build output. Change the source and rebuild with `node design/source/docs-kit/build.mjs --out _site`.",
  },
];

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

const raw = await readStdin();
let input;
try {
  input = JSON.parse(raw);
} catch {
  process.exit(0);
}

const filePath = input.tool_input?.file_path ?? "";
if (!filePath) process.exit(0);

// CLAUDE_PROJECT_DIR stays at the folder the session started in, even after it
// enters a worktree, so a worktree file would look like
// `.claude/worktrees/<name>/design/source/...` and match no rule. Use the
// repository that actually contains the file: its top level, found from the
// hook input's `cwd`. Fall back to the old root outside a git repository.
function repoRoot(file) {
  let dir = path.dirname(file);
  while (!fs.existsSync(dir)) {
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  const r = spawnSync("git", ["-C", dir, "rev-parse", "--show-toplevel"], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : null;
}

// realpath of the nearest existing ancestor plus the rest, so a new file in a
// new directory still resolves (and /tmp vs /private/tmp compare equal).
function realish(p) {
  let existing = p;
  const rest = [];
  while (!fs.existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) return p;
    rest.unshift(path.basename(existing));
    existing = parent;
  }
  return path.join(fs.realpathSync(existing), ...rest);
}

const cwd = input.cwd ?? process.cwd();
const absolute = path.resolve(cwd, filePath);
const root = repoRoot(absolute) ?? process.env.CLAUDE_PROJECT_DIR ?? cwd;
const relative = path
  .relative(realish(root), realish(absolute))
  .split(path.sep)
  .join("/");

const hit = PROTECTED.find((rule) => rule.test(relative));
if (hit) {
  process.stderr.write(`Blocked: \`${relative}\` ${hit.why}\n`);
  process.exit(2);
}

process.exit(0);
