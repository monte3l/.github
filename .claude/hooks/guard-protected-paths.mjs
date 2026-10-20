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

const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const relative = path
  .relative(root, path.resolve(root, filePath))
  .split(path.sep)
  .join("/");

const hit = PROTECTED.find((rule) => rule.test(relative));
if (hit) {
  process.stderr.write(`Blocked: \`${relative}\` ${hit.why}\n`);
  process.exit(2);
}

process.exit(0);
