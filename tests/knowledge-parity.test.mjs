// SPDX-FileCopyrightText: Copyright (c) 2026 Enrico Lionello (enri3l) and Giulia Montevecchi (giulmonte), monte3l
// SPDX-License-Identifier: MIT

// The parity gate for the knowledge/ wiki.
// Run with: node --test "tests/*.test.mjs"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
const repo = path.resolve(import.meta.dirname, "..");
const parity = (await import(new URL("../bin/knowledge-parity.mjs", import.meta.url).href)).default;

const CARD = "---\nurl: https://example.com/a\naccessed: 2026-11-19\n---\n\n# A card\n";
const PAGE = "---\nreviewed: 2026-11-19\nsources:\n  - raw/a.md\n---\n\n# A page\n\n**Status:** Decision · **Reviewed:** 2026-11-19\n\nText.\n";
const INDEX = "# Index\n\n- [A](wiki/a.md)\n";
const LOG = "# Log\n\n## [2026-11-18] ingest | One\n\n## [2026-11-19] lint | Two\n";
const CONFIG = { pages: [{ src: "knowledge/wiki/a.md" }] };

function tree(over = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "kn-"));
  const files = { "knowledge/raw/a.md": CARD, "knowledge/wiki/a.md": PAGE, "knowledge/README.md": INDEX, "knowledge/log.md": LOG, "knowledge/CLAUDE.md": "# Schema\n", ...over };
  for (const [rel, text] of Object.entries(files)) {
    if (text === null) continue;
    mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    writeFileSync(path.join(root, rel), text);
  }
  return root;
}
let failed = 0;
async function expectProblem(name, over, needle, config = CONFIG) {
  const root = tree(over);
  const problems = await parity({ root, config });
  rmSync(root, { recursive: true });
  const ok = needle === null ? problems.length === 0 : problems.some((p) => p.includes(needle));
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n       wanted: ${needle}\n       got: ${JSON.stringify(problems)}`}`);
  if (!ok) failed++;
}
await expectProblem("a valid tree has no problems", {}, null);
await expectProblem("no frontmatter on a page", { "knowledge/wiki/a.md": "# A\n" }, "no frontmatter");
await expectProblem("reviewed is not a date", { "knowledge/wiki/a.md": PAGE.replace("reviewed: 2026-11-19", "reviewed: 2026-13-40") }, '"reviewed" must be a date');
await expectProblem("a page with no sources", { "knowledge/wiki/a.md": PAGE.replace("sources:\n  - raw/a.md\n", "sources:\n") }, "at least one source");
await expectProblem("a source card that does not exist", { "knowledge/wiki/a.md": PAGE.replace("raw/a.md", "raw/missing.md") }, "does not exist");
await expectProblem("a source that is neither a card nor a URL", { "knowledge/wiki/a.md": PAGE.replace("raw/a.md", "somewhere/else.md") }, "neither a card");
await expectProblem("an https URL is an accepted source", { "knowledge/wiki/a.md": PAGE.replace("raw/a.md", "https://example.com/x") }, null);
await expectProblem("an http URL is not", { "knowledge/wiki/a.md": PAGE.replace("raw/a.md", "http://example.com/x") }, "neither a card");
await expectProblem("the visible date differs from the frontmatter", { "knowledge/wiki/a.md": PAGE.replace("**Reviewed:** 2026-11-19", "**Reviewed:** 2026-11-01") }, "differs from the frontmatter");
await expectProblem("no visible Reviewed date", { "knowledge/wiki/a.md": PAGE.replace("**Status:** Decision · **Reviewed:** 2026-11-19", "**Status:** Decision") }, "the line under the title");
await expectProblem("an unsupported frontmatter line", { "knowledge/wiki/a.md": PAGE.replace("reviewed: 2026-11-19", "reviewed: 2026-11-19\nweird line without a key") }, "unsupported frontmatter line");
await expectProblem("a page missing from docs.config.mjs", {}, "not in \"pages\"", { pages: [] });
await expectProblem("a page the index does not link", { "knowledge/README.md": "# Index\n" }, "does not link wiki/a.md");
await expectProblem("a card without a url", { "knowledge/raw/a.md": CARD.replace("url: https://example.com/a\n", "") }, '"url" must be an https URL');
await expectProblem("a card with an http url", { "knowledge/raw/a.md": CARD.replace("https://", "http://") }, '"url" must be an https URL');
await expectProblem("a card with a bad accessed date", { "knowledge/raw/a.md": CARD.replace("2026-11-19", "yesterday") }, '"accessed" must be a date');
await expectProblem("a log heading in the wrong shape", { "knowledge/log.md": LOG + "\n## 2026-11-20 added a thing\n" }, "is not \"## [YYYY-MM-DD]");
await expectProblem("a log kind that does not exist", { "knowledge/log.md": LOG + "\n## [2026-11-20] chat | x\n" }, "is not \"## [YYYY-MM-DD]");
await expectProblem("a log entry earlier than the one above", { "knowledge/log.md": LOG + "\n## [2026-11-01] ingest | Back in time\n" }, "earlier than the entry above");
await expectProblem("the same date twice is fine", { "knowledge/log.md": LOG + "\n## [2026-11-19] ingest | Same day\n" }, null);
await expectProblem("a missing log", { "knowledge/log.md": null }, "knowledge/log.md: missing");
await expectProblem("a missing schema", { "knowledge/CLAUDE.md": null }, "knowledge/CLAUDE.md: missing");

// --- fixes from the review
await expectProblem("a repeated frontmatter key", { "knowledge/wiki/a.md": PAGE.replace("sources:\n  - raw/a.md\n", "sources:\n  - raw/a.md\nsources:\n  - raw/b.md\n") }, "duplicate frontmatter key");
await expectProblem("Reviewed must be directly under the title, not at the end", { "knowledge/wiki/a.md": PAGE.replace("**Status:** Decision · **Reviewed:** 2026-11-19\n\nText.\n", "Text.\n\n> **Reviewed:** 2026-11-19\n") }, "the line under the title");
await expectProblem("a heading that exists only inside fenced code is not a title", { "knowledge/wiki/a.md": PAGE.replace("# A page\n", "```bash\n# not a title\n```\n") }, 'no "# " heading');
await expectProblem("an example heading inside fenced code is not a log entry", { "knowledge/log.md": LOG + "\n```\n## [2020-01-01] ingest | example\n```\n" }, null);
await expectProblem("a CRLF log is read the same", { "knowledge/log.md": LOG.replace(/\n/g, "\r\n") }, null);
await expectProblem("the index accepts ./wiki/, a fragment and a title", { "knowledge/README.md": '# Index\n\n- [a](./wiki/a.md#part)\n' }, null);
await expectProblem("the index accepts a link title", { "knowledge/README.md": '# Index\n\n- [a](wiki/a.md "A page")\n' }, null);
await expectProblem("a link inside a code span is not a link", { "knowledge/README.md": "# Index\n\nSee `[a](wiki/a.md)`.\n" }, "does not link wiki/a.md");
await expectProblem("a link inside fenced code is not a link", { "knowledge/README.md": "# Index\n\n```\n[a](wiki/a.md)\n```\n" }, "does not link wiki/a.md");
console.log(failed === 0 ? "\nALL SCENARIOS BEHAVE" : `\n${failed} FAILED`);
process.exit(failed ? 1 : 0);
