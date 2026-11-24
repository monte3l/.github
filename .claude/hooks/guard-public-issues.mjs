#!/usr/bin/env node
/**
 * PreToolUse guard (Bash, `gh issue|pr create|comment|edit`): two rules for
 * text that is about to be published.
 *
 *  - Counts only in the public repository. `monte3l/.github` is public, and its
 *    audit output carries counts, never which repository is out of line. A
 *    body that holds a `DRIFT` line, or a line saying a copy is N versions
 *    "behind" (its starter or template), and the name of an org repository is denied there
 *    (exit 2).
 *  - A suspected vulnerability is not an issue. The tracking policy routes it
 *    to a private report and a security advisory. Text with vulnerability
 *    wording gets `permissionDecision: "ask"`: a documentation change that
 *    merely names the word is legitimate, so a person decides.
 *
 * The text checked is the command line plus the file named by `--body-file`
 * or `-F`. A body piped on stdin (`--body-file -`) cannot be read here.
 * Fail-open on input it cannot read.
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

const PUBLISHING = /\bgh\s+(issue|pr)\s+(create|comment|edit)\b/;
const VULNERABILITY = /vulnerab|\bCVE-\d{4}-\d{3,}|\bexploit|security advisory|zero-day|\bRCE\b/i;
// The baseline prints `DRIFT  label`. Match the uppercase word anywhere: an inline --body puts it
// mid-line, after the flag. It only counts together with an org repository name.
const DRIFT_LINE = /\bDRIFT\b/;
// The template sync says `m3l-x: file is 2 versions behind its starter`, and its plan used to print
// `m3l-x: file, 2 version(s) behind`. Same rule: with an org repository name it says where to aim, so
// only the count may be published.
const BEHIND_LINE = /\bversion(?:s|\(s\))? behind\b/;

/** The text a publishing command would send. */
export function publishedText(command, cwd) {
  let text = command;
  for (const m of command.matchAll(/(?:--body-file|-F)[ =]+("[^"]+"|'[^']+'|\S+)/g)) {
    const file = m[1].replace(/^["']|["']$/g, "");
    if (file === "-") continue;
    try {
      text += `\n${fs.readFileSync(path.resolve(cwd, file), "utf8")}`;
    } catch {
      // an unreadable file adds nothing
    }
  }
  return text;
}

/** `owner/name` the command publishes to: `-R/--repo`, else the origin remote. */
export function targetRepo(command, cwd) {
  const flag = /(?:^|\s)(?:-R|--repo)[ =]+(\S+)/.exec(command)?.[1];
  if (flag) return flag.replace(/^["']|["']$/g, "");
  const r = spawnSync("git", ["-C", cwd, "remote", "get-url", "origin"], { encoding: "utf8" });
  if (r.status !== 0) return null;
  return /[:/]([^/:]+\/[^/]+?)(?:\.git)?$/.exec(r.stdout.trim())?.[1] ?? null;
}

/** Names of the org's repositories, from blueprint/projects.json of the repo at `cwd`. */
export function orgRepoNames(cwd) {
  const top = spawnSync("git", ["-C", cwd, "rev-parse", "--show-toplevel"], { encoding: "utf8" });
  if (top.status !== 0) return [];
  try {
    const list = JSON.parse(fs.readFileSync(path.join(top.stdout.trim(), "blueprint/projects.json"), "utf8"));
    return list.map((p) => p.repo).filter((n) => n && n !== ".github");
  } catch {
    return [];
  }
}

/** @returns {{decision: "deny"|"ask", reason: string}|null} */
export function judge(command, cwd) {
  if (!PUBLISHING.test(command)) return null;
  const text = publishedText(command, cwd);
  const repo = targetRepo(command, cwd);
  if (repo === "monte3l/.github" && (DRIFT_LINE.test(text) || BEHIND_LINE.test(text))) {
    const named = orgRepoNames(cwd).find((n) => text.includes(n));
    if (named) {
      return {
        decision: "deny",
        reason:
          "monte3l/.github is public and its audit output carries counts only. This text has a DRIFT or \"behind its starter\" line that names an org repository. Publish the counts, and keep the per-repository detail local (bin/org-audit.sh).",
      };
    }
  }
  if (VULNERABILITY.test(text)) {
    return {
      decision: "ask",
      reason:
        "This text has vulnerability wording. A suspected vulnerability is never a public issue: use a private report and a security advisory (SECURITY.md). Approve only if this merely mentions the word, for example in documentation.",
    };
  }
  return null;
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
  if (input.tool_name === "Bash") {
    const verdict = judge(input.tool_input?.command ?? "", input.cwd ?? process.cwd());
    if (verdict?.decision === "deny") {
      process.stderr.write(`Blocked: ${verdict.reason}\n`);
      process.exit(2);
    }
    if (verdict?.decision === "ask") {
      process.stdout.write(
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "ask",
            permissionDecisionReason: verdict.reason,
          },
        }),
      );
    }
  }
  process.exit(0);
}
