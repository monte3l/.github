// SPDX-FileCopyrightText: Copyright (c) 2026 Enrico Lionello (enri3l) and Giulia Montevecchi (giulmonte), monte3l
// SPDX-License-Identifier: MIT

// The weekly staleness report of the knowledge/ wiki.
// Run with: node --test "tests/*.test.mjs"
const { reviewFindings } = await import(new URL("../bin/lib/knowledge.mjs", import.meta.url).href);
let failed = 0;
const check = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n   got ${JSON.stringify(got)}`}`); if (!ok) failed++; };
const base = { cards: ["raw/a.md"], today: "2026-11-19", maxAgeDays: 180 };
const page = (reviewed, sources = ["raw/a.md"]) => ({ rel: "p", reviewed, sources });
check("a current page is quiet", reviewFindings({ ...base, pages: [page("2026-11-01")] }), []);
check("a stale page is reported", reviewFindings({ ...base, pages: [page("2026-01-01")] }).map((l) => l.split(":")[0]), ["STALE   p"]);
check("a future date is reported, not hidden", reviewFindings({ ...base, pages: [page("2027-01-01")] }).map((l) => l.split(":")[0]), ["FUTURE  p"]);
check("a future date is reported even with a huge limit", reviewFindings({ ...base, maxAgeDays: 99999, pages: [page("2099-01-01")] }).map((l) => l.split(":")[0]), ["FUTURE  p"]);
check("an unreadable date is INVALID, not stale on an invented date", reviewFindings({ ...base, pages: [page(null)] }).map((l) => l.split(" ")[0]), ["INVALID"]);
check("an INVALID page that still lists its source does not orphan the card", reviewFindings({ ...base, pages: [page(null)] }).filter((l) => l.startsWith("ORPHAN")), []);
check("a dead citation", reviewFindings({ ...base, pages: [page("2026-11-19", ["raw/gone.md"])] }).filter((l) => l.startsWith("DEAD")).length, 1);
check("an orphan card", reviewFindings({ ...base, pages: [page("2026-11-19", [])] }).filter((l) => l.startsWith("ORPHAN")).length, 1);
console.log(failed ? `${failed} FAILED` : "ALL REPORT CASES BEHAVE"); process.exit(failed ? 1 : 0);
