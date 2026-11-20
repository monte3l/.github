#!/usr/bin/env node
/**
 * PreToolUse guard (Write|Edit, and Bash for git): implementation happens in a
 * linked git worktree off origin/main, never in a repository's main checkout.
 *
 *  - Write|Edit: blocks when the file belongs to a main worktree.
 *  - Bash: blocks `git commit`, `git switch -c|-C|--create` and
 *    `git checkout -b|-B` when the target (`git -C DIR`, else the hook's `cwd`)
 *    is a main worktree. `git pull`, `git fetch` and `git worktree add` stay
 *    allowed: finishing-work pulls main, and worktrees are made from it.
 *
 * A path outside any git repository (plans, memory, scratchpad) passes. The
 * hook reads the directory from the input's `cwd`, never CLAUDE_PROJECT_DIR,
 * which stays at the starting root after a session enters a worktree. No path
 * is hardcoded, so the same script works in any repository.
 *
 * Blocks by exiting 2 with a message on stderr. It fails open on input it
 * cannot read; settings.json marks it `onFailure: block` for a crash.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const HINT =
  "Work in a worktree off origin/main: EnterWorktree, or `git worktree add ../<repo>.wt/<branch> -b <branch> origin/main`.";

function git(dir, args) {
  const r = spawnSync("git", ["-C", dir, ...args], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : null;
}

/** Nearest existing directory at or above `target`. */
function existingDir(target) {
  let dir = path.resolve(target);
  while (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return dir;
}

/** The repository's top level when `dir` is in its main worktree, else null. */
export function mainWorktreeOf(target) {
  const dir = existingDir(target);
  if (!dir) return null;
  const out = git(dir, [
    "rev-parse",
    "--path-format=absolute",
    "--git-dir",
    "--git-common-dir",
    "--show-toplevel",
  ]);
  if (!out) return null;
  const [gitDir, common, top] = out.split("\n");
  if (!gitDir || !common || !top) return null;
  return fs.realpathSync(gitDir) === fs.realpathSync(common) ? top : null;
}

const WRITING = [
  /^commit$/,
  /^switch$/, // narrowed below to -c/-C/--create
  /^checkout$/, // narrowed below to -b/-B
];

/** Directory a git command line works in, and whether it writes history. */
export function gitWrites(segment, cwd) {
  const words = segment.trim().split(/\s+/);
  const at = words.findIndex((w) => w === "git" || w.endsWith("/git"));
  if (at < 0) return null;
  let dir = cwd;
  let i = at + 1;
  while (i < words.length && words[i].startsWith("-")) {
    if (words[i] === "-C" && words[i + 1]) {
      dir = path.resolve(dir, words[i + 1].replace(/^["']|["']$/g, ""));
      i += 2;
    } else if (words[i] === "-c") {
      i += 2;
    } else {
      i += 1;
    }
  }
  const sub = words[i];
  if (!sub || !WRITING.some((re) => re.test(sub))) return null;
  const rest = words.slice(i + 1);
  if (
    sub === "switch" &&
    !rest.some((w) => /^(-c|-C|--create|--force-create)$/.test(w))
  )
    return null;
  if (sub === "checkout" && !rest.some((w) => /^(-b|-B)$/.test(w))) return null;
  return { dir, sub };
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

function block(message) {
  process.stderr.write(`Blocked: ${message} ${HINT}\n`);
  process.exit(2);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let input;
  try {
    input = JSON.parse(await readStdin());
  } catch {
    process.exit(0);
  }
  const cwd = input.cwd ?? process.cwd();
  const tool = input.tool_name ?? "";

  if (tool === "Write" || tool === "Edit") {
    const filePath = input.tool_input?.file_path ?? "";
    if (filePath) {
      const top = mainWorktreeOf(path.resolve(cwd, filePath));
      if (top) block(`\`${filePath}\` is in the main checkout of ${top}.`);
    }
  } else if (tool === "Bash") {
    const command = input.tool_input?.command ?? "";
    for (const segment of command.split(/&&|\|\||;|\n|\|/)) {
      const hit = gitWrites(segment, cwd);
      if (!hit) continue;
      const top = mainWorktreeOf(hit.dir);
      if (top)
        block(`\`git ${hit.sub}\` would run in the main checkout of ${top}.`);
    }
  }
  process.exit(0);
}
