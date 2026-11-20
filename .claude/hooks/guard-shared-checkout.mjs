#!/usr/bin/env node
/**
 * PreToolUse guard (Write|Edit, and Bash for git): implementation happens in a
 * linked git worktree off origin/main, never in a repository's main checkout.
 *
 *  - Write|Edit: blocks when the file belongs to a main worktree.
 *  - Bash: blocks `git commit`, `git switch -c|-C|--create` and
 *    `git checkout -b|-B` when the target (`git -C DIR`, a `cd DIR` before it,
 *    else the hook's `cwd`) is a main worktree. `git pull`, `git fetch` and
 *    `git worktree add` stay allowed: finishing-work pulls main, and worktrees
 *    are made from it.
 *
 * A path outside any git repository (plans, memory, scratchpad) passes. The
 * hook reads the directory from the input's `cwd`, never CLAUDE_PROJECT_DIR,
 * which stays at the starting root after a session enters a worktree. No path
 * is hardcoded, so the same script works in any repository.
 *
 * It reads a command line the way a shell does, so text that only names a
 * command (a commit message saying "a git commit") is not a command. It looks
 * through `bash -c '...'`, `eval`, `$(...)` and backticks, and it takes any
 * `git` word of a simple command as the command, so a prefix such as `sudo`,
 * `time`, `if ...; then` or `xargs` does not hide it. Where it cannot tell, it
 * errs towards blocking: a path built from a shell variable is judged from the
 * hook's own `cwd`.
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
const SHELL = /(^|\/)(sh|bash|zsh|dash|ksh)$/;

/** Index of the parenthesis closing the one at `open`, or the last index. */
function closingParen(line, open) {
  let depth = 0;
  for (let i = open; i < line.length; i++) {
    if (line[i] === "(") depth++;
    else if (line[i] === ")" && --depth === 0) return i;
  }
  return line.length - 1;
}

/**
 * Splits a command line into simple commands, each a list of words, the way a
 * shell reads it: quotes group words and are removed, `&&`, `||`, `;`, `|`,
 * `&`, parentheses, backticks and newlines end a command, and the body of a
 * here-document is skipped. A `$(...)` or backtick inside double quotes runs, so
 * its body is read as commands too. `grouped` is true when the line has any
 * subshell or substitution, which makes a `cd` in it unreliable.
 *
 * @returns {{ commands: string[][], grouped: boolean }}
 */
export function simpleCommands(line) {
  const commands = [];
  const heredocs = [];
  const nested = [];
  let grouped = false;
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
      if (c === quote) {
        quote = null;
      } else if (quote === '"' && c === "$" && line[i + 1] === "(") {
        const end = closingParen(line, i + 1);
        nested.push(line.slice(i + 2, end));
        word += line.slice(i, end + 1);
        i = end;
      } else if (quote === '"' && c === "`") {
        const close = line.indexOf("`", i + 1);
        const end = close === -1 ? line.length : close;
        nested.push(line.slice(i + 1, end));
        word += line.slice(i, end + 1);
        i = end;
      } else if (c === "\\" && quote === '"' && i + 1 < line.length) {
        word += line[++i];
      } else {
        word += c;
      }
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
    } else if (c === "$" && line.startsWith("((", i + 1)) {
      // Arithmetic: a `<<` in it is a shift, not a here-document.
      word = (word ?? "") + "0";
      i = closingParen(line, i + 1);
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
      if ("()`".includes(c)) grouped = true;
      endCommand();
    } else {
      word = (word ?? "") + c;
    }
  }
  endCommand();
  for (const body of nested) {
    commands.push(...simpleCommands(body).commands);
    grouped = true;
  }
  return { commands, grouped };
}

/**
 * The simple commands to judge: each one, plus what a shell wrapper runs
 * (`bash -c '...'`, `eval ...`), read as commands in turn. `top` is false for
 * a nested one.
 *
 * @returns {{ words: string[], top: boolean }[]}
 */
export function expandCommands(commands, top = true) {
  const out = [];
  for (const words of commands) {
    out.push({ words, top });
    const shell = words.findIndex((w) => SHELL.test(w));
    if (shell >= 0) {
      const flag = words.findIndex(
        (w, i) => i > shell && /^-[a-z]*c[a-z]*$/.test(w),
      );
      if (flag >= 0 && words[flag + 1] !== undefined)
        out.push(
          ...expandCommands(simpleCommands(words[flag + 1]).commands, false),
        );
    }
    const evalAt = words.indexOf("eval");
    if (evalAt >= 0)
      out.push(
        ...expandCommands(
          simpleCommands(words.slice(evalAt + 1).join(" ")).commands,
          false,
        ),
      );
  }
  return out;
}

const isGit = (w) => w === "git" || w.endsWith("/git");

/** Directory one simple git command works in, and whether it writes history. */
export function gitWrites(words, cwd) {
  const at = words.findIndex(isGit);
  if (at < 0) return null;
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
    const { commands, grouped } = simpleCommands(command);
    // A top-level `cd DIR` moves the commands after it. With a subshell or a
    // substitution anywhere in the line, or a path built from a variable, it
    // is ignored and the hook's own cwd is used.
    let dir = cwd;
    for (const { words, top: topLevel } of expandCommands(commands)) {
      if (
        topLevel &&
        !grouped &&
        words[0] === "cd" &&
        words[1] &&
        !/[$~*?]/.test(words[1])
      ) {
        dir = path.resolve(dir, words[1]);
        continue;
      }
      const hit = gitWrites(words, dir);
      if (!hit) continue;
      const top = mainWorktreeOf(hit.dir);
      if (top)
        block(`\`git ${hit.sub}\` would run in the main checkout of ${top}.`);
    }
  }
  process.exit(0);
}
