#!/usr/bin/env node
/**
 * SessionStart hook (startup|resume|compact): tells Claude where it is.
 *
 * Prints, as `additionalContext`: the current worktree and branch, how far the
 * branch is ahead of and behind origin/main, every other worktree of the
 * repository (branch, number of dirty files, locked or not) and, when `gh` is
 * available, the open pull requests of those branches. After a compaction this
 * restores what the summary tends to drop. Everything is best effort: a
 * missing tool or no network leaves that line out and never fails the session.
 */
import { spawnSync } from "node:child_process";
import process from "node:process";

function run(cmd, args, cwd, timeout = 5000) {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8", timeout });
  return r.status === 0 ? r.stdout.trim() : null;
}

/** Parse `git worktree list --porcelain` into {path, branch, locked}. */
export function parseWorktrees(text) {
  return text
    .split("\n\n")
    .map((block) => ({
      path: /^worktree (.+)$/m.exec(block)?.[1],
      branch: /^branch refs\/heads\/(.+)$/m.exec(block)?.[1] ?? "(detached)",
      locked: /^locked/m.test(block),
    }))
    .filter((w) => w.path);
}

export function render({ cwd, branch, counts, worktrees, prs }) {
  const lines = [`Session orientation: working in ${cwd} on branch ${branch}.`];
  if (counts) lines.push(`Against origin/main: ${counts.ahead} ahead, ${counts.behind} behind.`);
  const others = worktrees.filter((w) => w.path !== cwd);
  if (others.length > 0) {
    lines.push("Other worktrees of this repository:");
    for (const w of others) {
      const flags = [w.dirty ? `${w.dirty} dirty file(s)` : "clean", w.locked ? "locked" : null]
        .filter(Boolean)
        .join(", ");
      const pr = prs?.get(w.branch);
      lines.push(`- ${w.path} [${w.branch}] ${flags}${pr ? ` — PR #${pr}` : ""}`);
    }
  }
  return lines.join("\n");
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let input = {};
  try {
    input = JSON.parse(await readStdin());
  } catch {
    // no input: fall back to the process cwd
  }
  const cwd = input.cwd ?? process.cwd();
  const top = run("git", ["rev-parse", "--show-toplevel"], cwd);
  if (!top) process.exit(0);

  const branch = run("git", ["rev-parse", "--abbrev-ref", "HEAD"], top) ?? "(unknown)";
  const lr = run("git", ["rev-list", "--left-right", "--count", "origin/main...HEAD"], top);
  const counts = lr ? { behind: lr.split(/\s+/)[0], ahead: lr.split(/\s+/)[1] } : null;
  const listing = run("git", ["worktree", "list", "--porcelain"], top) ?? "";
  const worktrees = parseWorktrees(listing).map((w) => ({
    ...w,
    dirty: (run("git", ["status", "--porcelain"], w.path)?.split("\n").filter(Boolean).length) ?? 0,
  }));

  let prs = null;
  const json = run("gh", ["pr", "list", "--author", "@me", "--state", "open", "--json", "number,headRefName"], top);
  if (json) {
    try {
      prs = new Map(JSON.parse(json).map((p) => [p.headRefName, p.number]));
    } catch {
      prs = null;
    }
  }

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext: render({ cwd: top, branch, counts, worktrees, prs }),
      },
    }),
  );
}
