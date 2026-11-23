#!/usr/bin/env node
/**
 * PreToolUse guard (Write|Edit): asks before a change whose only effect is to
 * bump a review marker, because a report is never cleared by moving a date.
 *
 *  - In a markdown file: the `reviewed:` frontmatter date or a
 *    `**Reviewed:** YYYY-MM-DD` line (knowledge wiki pages, ROADMAP.md and any
 *    docs page the page-age report covers).
 *  - In `blueprint/upstream.json`: the `reviewed` value of an entry, which
 *    `bin/upstream-watch.sh --accept NAME` records after a person has read
 *    the upstream change.
 *
 * An edit that changes anything else as well passes silently: the review
 * marker moves with real work. The answer is `permissionDecision: "ask"`, not
 * a block, so a person who did review the page can approve it.
 */
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

const DATE = "\\d{4}-\\d{2}-\\d{2}";
const FRONTMATTER_MARKER = new RegExp(`(^|\\n)(reviewed:[ \\t]*)${DATE}`, "gi");
const VISIBLE_MARKER = new RegExp(`(\\*\\*Reviewed:\\*\\*[ \\t]*)${DATE}`, "gi");
const UPSTREAM_MARKER = /("reviewed"\s*:\s*)"[^"]*"/g;

/** The text with every review marker replaced by a fixed token. */
export function normalize(file, text) {
  if (file.endsWith(".md")) {
    return text.replace(FRONTMATTER_MARKER, "$1$2<DATE>").replace(VISIBLE_MARKER, "$1<DATE>");
  }
  if (file === "blueprint/upstream.json" || file.endsWith("/blueprint/upstream.json")) {
    return text.replace(UPSTREAM_MARKER, '$1"<REVIEWED>"');
  }
  return null;
}

/** True when `before` and `after` differ only in review markers. */
export function onlyReviewMarkerChanged(file, before, after) {
  if (before === after) return false;
  const a = normalize(file, before);
  const b = normalize(file, after);
  return a !== null && b !== null && a === b;
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
  const ti = input.tool_input ?? {};
  const filePath = ti.file_path ?? "";
  if (filePath) {
    const absolute = path.resolve(input.cwd ?? process.cwd(), filePath);
    let before = null;
    let after = null;
    if (input.tool_name === "Edit" && typeof ti.old_string === "string" && typeof ti.new_string === "string") {
      before = ti.old_string;
      after = ti.new_string;
    } else if (input.tool_name === "Write" && typeof ti.content === "string" && fs.existsSync(absolute)) {
      before = fs.readFileSync(absolute, "utf8");
      after = ti.content;
    }
    if (before !== null && onlyReviewMarkerChanged(absolute, before, after)) {
      process.stdout.write(
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "ask",
            permissionDecisionReason:
              "This change only moves a review marker. A report is not cleared by bumping a date: record what was reviewed, or leave the date. Approve only if the page or upstream change was actually reviewed.",
          },
        }),
      );
    }
  }
  process.exit(0);
}
