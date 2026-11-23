#!/usr/bin/env node
/**
 * PreToolUse guard (Write|Edit): asks before editing a file that another
 * worktree of the same repository has modified and not yet committed.
 *
 * Two sessions working on the same repository from separate worktrees collide
 * on shared files (for example `bin/lib/upsert-issue.sh`). The hook answers
 * `permissionDecision: "ask"`, not a block: rebasing onto a peer that has
 * merged is legitimate, so a person decides.
 *
 * Offline and fast: it only runs `git worktree list` and `git status`. A file
 * in no repository, or a repository with one worktree, passes silently.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

// `import.meta.url` is symlink-resolved and percent-encoded, `process.argv[1]`
// is neither, so comparing them as strings is false under a symlinked or spaced
// path: the hook would never run and silently fail open (exit 0).
function isEntryPoint() {
  try {
    return fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

function git(dir, args) {
  const r = spawnSync("git", ["-C", dir, ...args], { encoding: "utf8" });
  return r.status === 0 ? r.stdout : null;
}

function existingDir(target) {
  let dir = path.resolve(target);
  while (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return dir;
}

/** Other worktrees (path, branch) that have uncommitted changes to `file`. */
export function collisions(file) {
  const dir = existingDir(path.dirname(file));
  if (!dir) return [];
  const top = git(dir, ["rev-parse", "--show-toplevel"])?.trim();
  const list = git(dir, ["worktree", "list", "--porcelain"]);
  if (!top || !list) return [];
  const here = fs.realpathSync(top);
  const rel = path.relative(here, path.join(fs.realpathSync(dir), path.basename(file)));
  const found = [];
  for (const block of list.split("\n\n")) {
    const wt = /^worktree (.+)$/m.exec(block)?.[1];
    if (!wt || !fs.existsSync(wt) || fs.realpathSync(wt) === here) continue;
    const dirty = git(wt, ["status", "--porcelain", "--", rel]);
    if (dirty?.trim()) {
      const branch = /^branch refs\/heads\/(.+)$/m.exec(block)?.[1] ?? "detached";
      found.push({ path: wt, branch });
    }
  }
  return found;
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

if (isEntryPoint()) {
  let input;
  try {
    input = JSON.parse(await readStdin());
  } catch {
    process.exit(0);
  }
  const filePath = input.tool_input?.file_path ?? "";
  if (filePath) {
    const cwd = input.cwd ?? process.cwd();
    const hits = collisions(path.resolve(cwd, filePath));
    if (hits.length > 0) {
      const where = hits.map((h) => `${h.path} (${h.branch})`).join(", ");
      process.stdout.write(
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "ask",
            permissionDecisionReason: `${filePath} has uncommitted changes in another worktree: ${where}. Check who owns it before editing.`,
          },
        }),
      );
    }
  }
  process.exit(0);
}
