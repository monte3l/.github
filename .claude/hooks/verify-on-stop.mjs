#!/usr/bin/env node
/**
 * Stop hook: the verification loop. When the turn leaves uncommitted changes
 * under paths whose files must move together (blueprint, scripts, templates,
 * the knowledge wiki, the site config, the org profile, the issue forms), run
 * the docs-kit `--check` (which runs every parity module) and only the test
 * files mapped from the changed paths. Exit 2 feeds the output back so Claude
 * fixes it before stopping.
 *
 * It runs at the end of a turn, not after each edit: a parity pair fails
 * between the first edit and the second. Claude Code overrides a Stop hook
 * after 8 consecutive blocks with no tool call, so a loop cannot run away.
 * The tests ride on the same cap; the full suite (about a minute) stays a
 * pre-PR step in `creating-prs`.
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

/** Paths whose changes trigger the parity check. */
const COUPLED = [
  /^blueprint\//,
  /^bin\//,
  /^workflow-templates\//,
  /^knowledge\//,
  /^docs\.config\.mjs$/,
  /^profile\/README\.md$/,
  /^\.github\/ISSUE_TEMPLATE\//,
  /(^|\/)ROADMAP\.md$/,
];

/** Changed-path pattern → test files under tests/. */
const TESTS = [
  [/^blueprint\/(bootstrap\.json|files\/)|^bin\/lib\/bootstrap\.mjs$|^bin\/bootstrap-parity\.mjs$/, ["bootstrap-parity", "bootstrap-render"]],
  [/^knowledge\/|^bin\/knowledge-|^bin\/lib\/knowledge\.mjs$/, ["knowledge-parity", "knowledge-report"]],
  [/^blueprint\/sync\.json$|^bin\/(lib\/)?template-sync|^bin\/sync-parity\.mjs$|^workflow-templates\//, ["template-sync", "sync-parity"]],
  [/^bin\/new-repo\.sh$/, ["new-repo"]],
  // The guard starters in blueprint/files/ and the push guard's helper are copies of, or used by, the hooks.
  [/^\.claude\/hooks\/|^bin\/lib\/signed-range\.mjs$|^blueprint\/files\//, ["harness-"]],
];

export function plan(changed) {
  const check = changed.some((f) => COUPLED.some((re) => re.test(f)));
  const names = new Set();
  for (const f of changed) for (const [re, list] of TESTS) if (re.test(f)) list.forEach((n) => names.add(n));
  return { check, names: [...names] };
}

/** Resolve names ("harness-" is a prefix) to existing test files. */
export function testFiles(root, names) {
  const dir = path.join(root, "tests");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".test.mjs") && names.some((n) => f.startsWith(n)))
    .map((f) => path.join("tests", f));
}

function changedFiles(root) {
  const r = spawnSync("git", ["-C", root, "status", "--porcelain", "-uall"], { encoding: "utf8" });
  if (r.status !== 0) return [];
  return r.stdout
    .split("\n")
    .filter(Boolean)
    .map((l) => l.slice(3).replace(/^.* -> /, "").replace(/^"|"$/g, ""));
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

if (isEntryPoint()) {
  let input = {};
  try {
    input = JSON.parse(await readStdin());
  } catch {
    process.exit(0);
  }
  const cwd = input.cwd ?? process.cwd();
  const top = spawnSync("git", ["-C", cwd, "rev-parse", "--show-toplevel"], { encoding: "utf8" });
  if (top.status !== 0) process.exit(0);
  const root = top.stdout.trim();

  const { check, names } = plan(changedFiles(root));
  const failures = [];
  const kit = "design/source/docs-kit/build.mjs";
  if (check && fs.existsSync(path.join(root, kit))) {
    const r = spawnSync("node", [kit, "--check"], { cwd: root, encoding: "utf8", timeout: 120000 });
    if (r.status !== 0) failures.push(`node ${kit} --check failed:\n${(r.stdout + r.stderr).trim()}`);
  }
  const files = testFiles(root, names);
  if (files.length > 0) {
    const r = spawnSync("node", ["--test", ...files], { cwd: root, encoding: "utf8", timeout: 240000 });
    if (r.status !== 0) failures.push(`node --test ${files.join(" ")} failed:\n${(r.stdout + r.stderr).trim().slice(-3000)}`);
  }
  if (failures.length > 0) {
    process.stderr.write(`Verification failed before stopping. Fix it, then finish.\n\n${failures.join("\n\n")}\n`);
    process.exit(2);
  }
}
