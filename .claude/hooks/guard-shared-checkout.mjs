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

const HEREDOC = /^<<(-?)[ \t]*(?:'([^']*)'|"([^"]*)"|([^\s;&|<>()]+))/;

/**
 * Splits a command line into simple commands, each a list of words, the way a
 * shell reads it: quotes group words and are removed, `&&`, `||`, `;`, `|`,
 * `&`, parentheses and newlines end a command, and the body of a here-document
 * is skipped. Text inside quotes or a here-document (a commit message that says
 * "a git commit") is therefore never mistaken for a command.
 */
export function simpleCommands(line) {
  const commands = [];
  const heredocs = [];
  let words = [];
  let word = null;
  let quote = null;
  const endWord = () => {
    if (word !== null) words.push(word);
    word = null;
  };
  const endCommand = () => {
    endWord();
    if (words.length > 0) commands.push(words);
    words = [];
  };
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === quote) quote = null;
      else if (c === "\\" && quote === '"' && i + 1 < line.length)
        word += line[++i];
      else word += c;
      continue;
    }
    if (c === "'" || c === '"') {
      quote = c;
      word ??= "";
    } else if (c === "\\" && i + 1 < line.length) {
      word = (word ?? "") + line[++i];
    } else if (c === " " || c === "\t") {
      endWord();
    } else if (c === "\n") {
      endCommand();
      for (const { delimiter, indented } of heredocs.splice(0)) {
        for (;;) {
          const end = line.indexOf("\n", i + 1);
          const text = line.slice(i + 1, end === -1 ? line.length : end);
          i = end === -1 ? line.length : end;
          const same =
            (indented ? text.replace(/^\t+/, "") : text) === delimiter;
          if (same || end === -1) break;
        }
      }
    } else if (c === "<" && line[i + 1] === "<" && line[i + 2] !== "<") {
      const m = HEREDOC.exec(line.slice(i));
      if (m) {
        heredocs.push({
          delimiter: m[2] ?? m[3] ?? m[4],
          indented: m[1] === "-",
        });
        endWord();
        i += m[0].length - 1;
      }
    } else if ("&|;()`".includes(c)) {
      endCommand();
    } else {
      word = (word ?? "") + c;
    }
  }
  endCommand();
  return commands;
}

/** The command name of a word list, past env assignments and wrappers. */
function commandIndex(words) {
  let i = 0;
  while (
    i < words.length &&
    (/^[A-Za-z_]\w*=/.test(words[i]) ||
      ["env", "command", "exec"].includes(words[i]))
  )
    i++;
  return i;
}

/** Directory one simple git command works in, and whether it writes history. */
export function gitWrites(words, cwd) {
  const at = commandIndex(words);
  const name = words[at];
  if (name !== "git" && !name?.endsWith("/git")) return null;
  let dir = cwd;
  let i = at + 1;
  while (i < words.length && words[i].startsWith("-")) {
    if (words[i] === "-C" && words[i + 1]) {
      dir = path.resolve(dir, words[i + 1]);
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
    for (const words of simpleCommands(command)) {
      const hit = gitWrites(words, cwd);
      if (!hit) continue;
      const top = mainWorktreeOf(hit.dir);
      if (top)
        block(`\`git ${hit.sub}\` would run in the main checkout of ${top}.`);
    }
  }
  process.exit(0);
}
