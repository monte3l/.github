// SPDX-FileCopyrightText: Copyright (c) 2026 Enrico Lionello (enri3l) and Giulia Montevecchi (giulmonte), monte3l
// SPDX-License-Identifier: MIT

import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_URL,
  UNSET,
  applyDecisions,
  applySiteAhead,
  baselineTotal,
  classify,
  formatMarker,
  hashAnswer,
  nextAgreed,
  normJustification,
  normKey,
  normStatus,
  parseCriteria,
  parseMarker,
  proposalUrls,
  readAnswers,
  renderFile,
} from "../bin/lib/bestpractices.mjs";

// Excerpts in the shape of the two upstream files, including the awkward
// lines the real ones have: a group heading, a criterion with a trailing
// comment, and a block whose text holds a colon.
const METAL = `--- !!omap
- '0': !!omap
  - Basics: !!omap
    - Basic project website content: !!omap
      - description_good:
          category: MUST
          autofill: >
            Look at the README for something like:
            this project does X.
      - contribution:
          category: MUST
          na_allowed: true
- '1': !!omap
  - Basics: !!omap
    - Prerequisites: !!omap
      - achieve_silver:
          category: MUST
  - Security: !!omap
    - Secured delivery: !!omap
      - hardened_site: # After delivery_mitm?
          category: MUST
          met_url_required: true
- '2': !!omap
  - Quality: !!omap
    - Tests: !!omap
      - test_statement_coverage90:
          category: SUGGESTED
`;

const BASELINE = `---
_metadata:
  total_controls: 3
baseline-1:
  General:
    Controls:
      osps_ac_01_01:
        category: MUST
        original_id: OSPS-AC-01.01
        na_allowed: true
      osps_ac_02_01:
        category: MUST
        original_id: OSPS-AC-02.01
baseline-2:
  General:
    Controls:
      osps_br_02_01:
        category: MUST
        original_id: OSPS-BR-02.01
`;

const criteria = parseCriteria(METAL, BASELINE);

const answer = (status, justification = "") => ({ status, justification });
const map = (entries) => new Map(Object.entries(entries));

test("parseCriteria maps each criterion to its section and N/A rule", () => {
  assert.equal(criteria.size, 7);
  assert.deepEqual(criteria.get("description_good"), { section: "passing", naAllowed: false, obsolete: false });
  assert.equal(criteria.get("contribution").naAllowed, true);
  assert.equal(criteria.get("hardened_site").section, "silver", "a trailing comment on the name line is allowed");
  assert.equal(criteria.get("test_statement_coverage90").section, "gold");
  assert.equal(criteria.get("osps_ac_01_01").section, "baseline-1");
  assert.equal(criteria.get("osps_ac_01_01").naAllowed, true);
  assert.equal(criteria.get("osps_br_02_01").section, "baseline-2");
  assert.ok(!criteria.has("Basics"), "a group heading is not a criterion");
  assert.ok(!criteria.has("achieve_silver"), "a level the site derives itself is not synced");
});

test("baselineTotal reads the file's own count, so a misparse can be caught", () => {
  assert.equal(baselineTotal(BASELINE), 3);
  assert.equal(baselineTotal("nothing here"), null);
  const found = [...criteria.values()].filter((c) => c.section.startsWith("baseline-")).length;
  assert.equal(found, baselineTotal(BASELINE));
});

test("normKey turns the site's spelling into the file's", () => {
  assert.equal(normKey("OSPS-AC-01.01_status"), "osps_ac_01_01_status");
  assert.equal(normKey("floss_license_status"), "floss_license_status");
});

test("normStatus accepts the site's words and BadgeApp's integers", () => {
  assert.equal(normStatus("Met"), "Met");
  assert.equal(normStatus(" unmet "), "Unmet");
  assert.equal(normStatus("n/a"), "N/A");
  assert.equal(normStatus("?"), "?");
  assert.equal(normStatus("unknown"), "?");
  assert.equal(normStatus(undefined), "?");
  assert.equal(normStatus(3), "Met");
  assert.equal(normStatus(0), "?");
  assert.equal(normStatus(1), "Unmet");
  assert.equal(normStatus(2), "N/A");
  assert.equal(normStatus(4), null);
  assert.equal(normStatus("Maybe"), null);
});

test("justification: CRLF and trailing space do not count, one character does", () => {
  assert.equal(normJustification("a\r\nb  \n"), "a\nb");
  assert.equal(normJustification(null), "");
  assert.notEqual(hashAnswer(answer("Met", "a b")), hashAnswer(answer("Met", "a  b")));
  const read = (text) =>
    readAnswers({ contribution_status: "Met", contribution_justification: text }, criteria).answers.get("contribution");
  assert.equal(hashAnswer(read("a\r\nb  ")), hashAnswer(read("a\nb")), "the same answer from either side hashes alike");
  assert.notEqual(hashAnswer(read("a b")), hashAnswer(read("a  b")));
});

test("readAnswers reads both spellings and drops the unset ones", () => {
  const { answers, invalid } = readAnswers(
    {
      "OSPS-AC-01.01_status": 3,
      "OSPS-AC-01.01_justification": "MFA is required org-wide",
      description_good_status: "?",
      contribution_status: "N/A",
      contribution_justification: "",
      achieve_passing_status: "Met",
      name: "kept elsewhere",
    },
    criteria,
  );
  assert.deepEqual([...answers.keys()].sort(), ["contribution", "osps_ac_01_01"]);
  assert.deepEqual(answers.get("osps_ac_01_01"), answer("Met", "MFA is required org-wide"));
  assert.deepEqual(invalid, []);
});

test("readAnswers reports a status the site would reject instead of syncing it", () => {
  const { answers, invalid } = readAnswers(
    { description_good_status: "N/A", hardened_site_status: "Perhaps", contribution_status: "Met" },
    criteria,
  );
  assert.deepEqual(invalid.sort(), ["description_good", "hardened_site"]);
  assert.deepEqual([...answers.keys()], ["contribution"]);
});

test("a justification kept under an unknown status still counts as an answer", () => {
  const { answers } = readAnswers({ contribution_status: "?", contribution_justification: "to do" }, criteria);
  assert.deepEqual(answers.get("contribution"), answer("?", "to do"));
});

// The four rows of the table, one criterion each. `agreed` is the base.
test("classify: every row of the three-way table", () => {
  const names = ["description_good", "contribution", "hardened_site", "test_statement_coverage90"];
  const small = new Map(names.map((n) => [n, criteria.get(n)]));
  const base = answer("Unmet", "old");
  const agreed = new Map(names.map((n) => [n, hashAnswer(base)]));
  const file = map({
    description_good: answer("Met", "same"), // both moved to the same value
    contribution: base, // file unchanged
    hardened_site: answer("Met", "file edit"), // file moved
    test_statement_coverage90: answer("Met", "file edit"), // both moved, differently
  });
  const site = map({
    description_good: answer("Met", "same"),
    contribution: answer("Met", "site edit"), // site moved
    hardened_site: base, // site unchanged
    test_statement_coverage90: answer("Unmet", "site edit"),
  });
  const out = classify(file, site, agreed, small);
  assert.deepEqual(out.inSync, ["description_good"]);
  assert.deepEqual(out.siteAhead, ["contribution"]);
  assert.deepEqual(out.repoAhead, ["hardened_site"]);
  assert.deepEqual(out.conflicts, ["test_statement_coverage90"]);
});

test("classify: a criterion the snapshot lacks was unset, so a site answer is site ahead", () => {
  const out = classify(new Map(), map({ contribution: answer("Met", "x") }), new Map(), criteria);
  assert.deepEqual(out.siteAhead, ["contribution"]);
  assert.deepEqual(out.repoAhead, []);
  assert.equal(out.inSync.length, criteria.size - 1, "everything unset on both sides is in sync");
});

test("classify: with no site answers, a file answer is repo ahead", () => {
  const out = classify(map({ contribution: answer("Met", "x") }), new Map(), new Map(), criteria);
  assert.deepEqual(out.repoAhead, ["contribution"]);
});

test("classify: clearing an answer on the site is a site change, not a lost file", () => {
  const was = answer("Met", "x");
  const out = classify(map({ contribution: was }), new Map(), map({ contribution: hashAnswer(was) }), criteria);
  assert.deepEqual(out.siteAhead, ["contribution"]);
  assert.equal(applySiteAhead(map({ contribution: was }), new Map(), out.siteAhead).has("contribution"), false);
});

test("nextAgreed keeps the old base for every open criterion", () => {
  const old = answer("Unmet", "old");
  const file = map({ contribution: answer("Met", "file"), hardened_site: answer("Met", "same") });
  const site = map({ contribution: old, hardened_site: answer("Met", "same") });
  const agreed = map({ contribution: hashAnswer(old) });
  const out = classify(file, site, agreed, criteria);
  const next = nextAgreed(file, site, out, agreed);
  assert.equal(next.get("hardened_site"), hashAnswer(answer("Met", "same")), "agreement is recorded");
  assert.equal(next.get("contribution"), hashAnswer(old), "an open repo-ahead criterion keeps its base");
  assert.ok(!next.has("description_good"), "unset answers are not stored");
});

test("renderFile keeps the file's own order and spelling, adds new keys where they belong, same bytes twice", () => {
  const existing = { name: "demo", "OSPS-AC-01.01_status": "Unmet", zeta: 1 };
  const answers = map({ osps_ac_01_01: answer("Met", "MFA"), contribution: answer("N/A") });
  const text = renderFile(existing, answers, criteria);
  assert.equal(
    text,
    `{\n  "name": "demo",\n  "OSPS-AC-01.01_status": "Met",\n  "OSPS-AC-01.01_justification": "MFA",\n  "zeta": 1,\n  "contribution_status": "N/A"\n}\n`,
  );
  assert.equal(renderFile(JSON.parse(text), readAnswers(JSON.parse(text), criteria).answers, criteria), text);
  assert.equal(renderFile(null, new Map(), criteria), "{}\n");
});

test("renderFile: a file that does not exist yet comes out in criteria order", () => {
  const answers = map({ osps_ac_01_01: answer("Met", "MFA"), contribution: answer("Met"), description_good: answer("Met", "readme") });
  assert.deepEqual(Object.keys(JSON.parse(renderFile(null, answers, criteria))), [
    "description_good_status",
    "description_good_justification",
    "contribution_status",
    "osps_ac_01_01_status",
    "osps_ac_01_01_justification",
  ]);
});

// The case that showed it: a file in criteria order, one criterion the site answered that it lacks.
// The change must be those two lines, not the whole file reordered.
test("renderFile: a pull request for one new answer changes only that answer", () => {
  const original = {
    osps_ac_01_01_status: "Met",
    osps_ac_01_01_justification: "MFA, with a trailing newline\n",
    description_good_status: "Met",
    description_good_justification: "readme",
    contribution_status: "unknown",
  };
  const before = `${JSON.stringify(original, null, 2)}\n`;
  const { answers } = readAnswers(original, criteria);
  const after = renderFile(original, new Map(answers).set("hardened_site", answer("Met", "site text")), criteria);
  // Appending after the last key puts a comma on the line before it; that is the whole of the noise.
  const lines = (text) => text.split("\n").map((l) => l.replace(/,$/, ""));
  const removed = lines(before).filter((line) => !lines(after).includes(line));
  const added = lines(after).filter((line) => !lines(before).includes(line));
  assert.deepEqual(removed, [], "no line of the original is lost or rewritten");
  assert.deepEqual(added.map((l) => l.trim()), ['"hardened_site_status": "Met"', '"hardened_site_justification": "site text"']);
  assert.ok(after.startsWith(before.slice(0, before.lastIndexOf('"contribution_status"'))), "everything before the last key is byte for byte the same");
  assert.match(after, /"contribution_status": "unknown"/, "an `unknown` placeholder is kept as written");
});

test("renderFile: a changed answer is rewritten in place, an unchanged one is left as written", () => {
  const existing = { a_other: 1, contribution_status: "met", contribution_justification: "old", hardened_site_status: "Met" };
  const answers = map({ contribution: answer("Met", "new"), hardened_site: answer("Met") });
  const out = JSON.parse(renderFile(existing, answers, criteria));
  assert.deepEqual(Object.keys(out), ["a_other", "contribution_status", "contribution_justification", "hardened_site_status"]);
  assert.equal(out.contribution_status, "met", "the same answer in another case is not a change");
  assert.equal(out.contribution_justification, "new");
});

test("renderFile: an answer the site cleared loses its keys, a ? placeholder stays", () => {
  const existing = { contribution_status: "Met", contribution_justification: "x", hardened_site_status: "?", keep: true };
  const out = JSON.parse(renderFile(existing, new Map(), criteria));
  assert.deepEqual(Object.keys(out), ["hardened_site_status", "keep"]);
});

test("proposalUrls: one link per section, forcing exactly its own keys", () => {
  const answers = map({
    description_good: answer("Met", "README says it & more"),
    contribution: answer("?"),
    osps_ac_01_01: answer("N/A", "no repo"),
  });
  const { urls, oversize } = proposalUrls("https://www.bestpractices.dev", 42, [...answers.keys()], answers, criteria);
  assert.deepEqual(oversize, []);
  assert.deepEqual(urls.map((u) => u.section).sort(), ["baseline-1", "passing"]);
  const passing = urls.find((u) => u.section === "passing");
  assert.equal(passing.count, 2);
  const url = new URL(passing.url);
  assert.equal(url.pathname, "/en/projects/42/passing/edit");
  assert.equal(url.searchParams.get("description_good_status"), "Met");
  assert.equal(url.searchParams.get("description_good_justification"), "README says it & more");
  assert.equal(url.searchParams.get("contribution_status"), "?", "an unset answer is sent as an explicit reset");
  assert.equal(
    url.searchParams.get("overrides"),
    "description_good_status,description_good_justification,contribution_status,contribution_justification",
  );
  assert.ok(!passing.url.includes("osps_ac_01_01"), "another section's keys are not in this link");
});

test("proposalUrls splits a long section and sets aside one that can never fit", () => {
  const answers = new Map();
  const wide = new Map();
  for (let i = 0; i < 40; i++) {
    wide.set(`c${i}`, { section: "passing", naAllowed: false, obsolete: false });
    answers.set(`c${i}`, answer("Met", "x".repeat(400)));
  }
  wide.set("huge", { section: "passing", naAllowed: false, obsolete: false });
  answers.set("huge", answer("Met", "y".repeat(MAX_URL)));
  const { urls, oversize } = proposalUrls("https://www.bestpractices.dev", 1, [...answers.keys()], answers, wide);
  assert.deepEqual(oversize, ["huge"]);
  assert.ok(urls.length > 1, "40 answers of 400 characters need more than one link");
  assert.equal(urls.reduce((n, u) => n + u.count, 0), 40, "every criterion is in exactly one link");
  for (const u of urls) assert.ok(u.url.length <= MAX_URL, `link is ${u.url.length} characters`);
});

test("a typo in the file is skipped: it never becomes a link that clears the site's answer", () => {
  const met = answer("Met", "right");
  const file = readAnswers({ contribution_status: "Mett" }, criteria);
  assert.deepEqual(file.invalid, ["contribution"]);
  const site = map({ contribution: met });
  const agreed = map({ contribution: hashAnswer(met) });
  const skip = new Set(file.invalid);
  const out = classify(file.answers, site, agreed, criteria, skip);
  assert.ok(![...out.inSync, ...out.siteAhead, ...out.repoAhead, ...out.conflicts].includes("contribution"));
  assert.deepEqual(proposalUrls("https://x.test", 1, out.repoAhead, file.answers, criteria).urls, []);
  assert.equal(nextAgreed(file.answers, site, out, agreed, skip).get("contribution"), hashAnswer(met), "its old base is kept");
  // Without the skip it would have been a change to unset, which is the bug.
  assert.deepEqual(classify(file.answers, site, agreed, criteria).repoAhead, ["contribution"]);
});

// What a person decided on conflicts, carried out. `state` is shaped like the sync CLI's `inspect`.
const stateOf = (file, site, conflicts, extra = {}) => ({ file: map(file), site: map(site), conflicts, object: null, invalid: [], ...extra });

test("applyDecisions: 'file' makes a link per section, 'site' rewrites the file, undecided stays a conflict", () => {
  const file = { description_good: answer("Met", "file one"), contribution: answer("Met", "file two"), osps_ac_01_01: answer("Met", "file three") };
  const site = { description_good: answer("Met", "site one"), contribution: answer("Met", "site two"), osps_ac_01_01: answer("Met", "site three") };
  const object = {
    name: "kept",
    description_good_status: "Met",
    description_good_justification: "file one",
    contribution_status: "Met",
    contribution_justification: "file two",
    osps_ac_01_01_status: "Met",
    osps_ac_01_01_justification: "file three",
  };
  const state = stateOf(file, site, ["description_good", "contribution", "osps_ac_01_01"], { object });
  const out = applyDecisions(map({ description_good: "file", contribution: "site" }), state, criteria, "https://x.test", 7);
  assert.deepEqual(out.keepFile, ["description_good"]);
  assert.deepEqual(out.keepSite, ["contribution"]);
  assert.deepEqual(out.skipped, []);
  assert.equal(out.proposals.urls.length, 1);
  assert.match(out.proposals.urls[0].url, /\/projects\/7\/passing\/edit\?description_good_status=Met&description_good_justification=file%20one&overrides=description_good_status,description_good_justification$/);
  const written = JSON.parse(out.fileText);
  assert.equal(written.contribution_justification, "site two", "the site's wording goes into the file");
  assert.equal(written.description_good_justification, "file one", "a 'file' decision leaves the file as it is");
  assert.equal(written.name, "kept");
  assert.equal(written.osps_ac_01_01_justification, "file three", "an undecided conflict is not touched, neither side's wording is applied");
});

test("applyDecisions: a decision that no longer matches a conflict is skipped, never applied", () => {
  const state = stateOf({ description_good: answer("Met", "same") }, { description_good: answer("Met", "same") }, []);
  const out = applyDecisions(map({ description_good: "site", contribution: "file", not_a_criterion: "file" }), state, criteria, "https://x.test", 1);
  assert.deepEqual(out.skipped.map((s) => [s.name, s.why]), [
    ["description_good", "not a conflict any more"],
    ["contribution", "not a conflict any more"],
    ["not_a_criterion", "not a criterion"],
  ]);
  assert.deepEqual([out.keepFile, out.keepSite, out.fileText], [[], [], null]);
  assert.deepEqual(out.proposals.urls, []);
});

test("applyDecisions: the file is not rewritten while it holds an answer the site would reject", () => {
  const state = stateOf({ contribution: answer("Met", "f") }, { contribution: answer("Met", "s") }, ["contribution"], { invalid: ["description_good"] });
  const out = applyDecisions(map({ contribution: "site" }), state, criteria, "https://x.test", 1);
  assert.equal(out.fileText, null);
  assert.deepEqual(out.keepSite, []);
  assert.match(out.skipped[0].why, /would reject/);
});

test("applyDecisions: custom wording goes to the file AND to the Save link, the same text in both", () => {
  const file = { description_good: answer("Met", "file one"), contribution: answer("Met", "file two") };
  const site = { description_good: answer("Met", "site one"), contribution: answer("Met", "site two") };
  const object = {
    description_good_status: "Met",
    description_good_justification: "file one",
    contribution_status: "Met",
    contribution_justification: "file two",
    name: "kept",
  };
  const state = stateOf(file, site, ["description_good", "contribution"], { object });
  const wording = { status: "Met", justification: "the corrected text" };
  const out = applyDecisions(map({ description_good: wording, contribution: "file" }), state, criteria, "https://x.test", 7);
  assert.deepEqual([...out.custom], [["description_good", answer("Met", "the corrected text")]]);
  assert.deepEqual(out.keepFile, ["contribution"]);
  assert.deepEqual(out.skipped, []);
  // The link forces both: the custom text for one, the file's own text for the other.
  const url = new URL(out.proposals.urls[0].url);
  assert.equal(url.searchParams.get("description_good_justification"), "the corrected text");
  assert.equal(url.searchParams.get("contribution_justification"), "file two");
  // The file's own answers first, then the custom ones: a fixed order, so the same decisions give the same link.
  assert.equal(url.searchParams.get("overrides"), "contribution_status,contribution_justification,description_good_status,description_good_justification");
  // And the file gets the custom text, with the other answer and the other keys as they were.
  const written = JSON.parse(out.fileText);
  assert.equal(written.description_good_justification, "the corrected text");
  assert.equal(written.contribution_justification, "file two");
  assert.equal(written.name, "kept");
});

test("applyDecisions: a custom answer is checked, and one the site would reject is skipped with a reason", () => {
  const state = stateOf(
    { description_good: answer("Met", "f"), contribution: answer("Met", "f"), hardened_site: answer("Met", "f") },
    { description_good: answer("Met", "s"), contribution: answer("Met", "s"), hardened_site: answer("Met", "s") },
    ["description_good", "contribution", "hardened_site"],
  );
  const out = applyDecisions(
    map({
      description_good: { status: "N/A", justification: "not for this one" }, // N/A not allowed here
      contribution: { status: "Maybe", justification: "x" },
      hardened_site: { status: "?", justification: "x" }, // a reset is not an answer
    }),
    state,
    criteria,
    "https://x.test",
    1,
  );
  assert.deepEqual(out.skipped.map((s) => [s.name, s.why]), [
    ["description_good", "N/A is not allowed for this criterion"],
    ["contribution", "the custom status must be Met, Unmet or N/A"],
    ["hardened_site", "the custom status must be Met, Unmet or N/A"],
  ]);
  assert.deepEqual([out.custom.size, out.fileText, out.proposals.urls], [0, null, []]);
});

test("applyDecisions: custom N/A is accepted where the criterion allows it, and the text is normalized", () => {
  const state = stateOf({ contribution: answer("Met", "f") }, { contribution: answer("Met", "s") }, ["contribution"], { object: {} });
  const out = applyDecisions(map({ contribution: { status: "n/a", justification: "not applicable here  \r\n" } }), state, criteria, "https://x.test", 1);
  assert.deepEqual(out.custom.get("contribution"), answer("N/A", "not applicable here"));
  assert.equal(JSON.parse(out.fileText).contribution_status, "N/A");
});

test("applyDecisions: custom wording is skipped when it is no longer a conflict, or the file holds an answer the site would reject", () => {
  const settled = stateOf({ contribution: answer("Met", "same") }, { contribution: answer("Met", "same") }, []);
  const stale = applyDecisions(map({ contribution: { status: "Met", justification: "x" } }), settled, criteria, "https://x.test", 1);
  assert.deepEqual(stale.skipped.map((s) => s.why), ["not a conflict any more"]);
  assert.equal(stale.fileText, null);

  const bad = stateOf({ contribution: answer("Met", "f") }, { contribution: answer("Met", "s") }, ["contribution"], { invalid: ["description_good"] });
  const blocked = applyDecisions(map({ contribution: { status: "Met", justification: "x" } }), bad, criteria, "https://x.test", 1);
  assert.match(blocked.skipped[0].why, /would reject/);
  assert.deepEqual([blocked.custom.size, blocked.fileText, blocked.proposals.urls], [0, null, []], "neither half is applied");
});

test("a retired criterion is not synced", () => {
  const retired = parseCriteria(`- '0': !!omap\n  - A: !!omap\n    - B: !!omap\n      - old_one:\n          category: MUST\n          obsolete: true\n      - new_one:\n          category: MUST\n`, "");
  assert.deepEqual([...retired.keys()], ["new_one"]);
});

test("the last marker counts, so answer text cannot plant a snapshot", () => {
  const fake = `<!-- bp-agreed:${JSON.stringify({ v: 2, a: { contribution: "aaaaaaaaaa" } })} -->`;
  const real = formatMarker(new Map([["contribution", hashAnswer(answer("Met"))]]));
  assert.equal(parseMarker(`${fake}\n\n${real}`).get("contribution"), hashAnswer(answer("Met")));
});

test("the snapshot marker round-trips and refuses anything it did not write", () => {
  const agreed = map({ b: hashAnswer(answer("Met", "b")), a: hashAnswer(answer("Unmet")) });
  const text = formatMarker(agreed);
  assert.match(text, /^<!-- bp-agreed:\{"v":2,"a":\{"a":"[0-9a-f]{10}","b":"[0-9a-f]{10}"\}\} -->$/);
  assert.deepEqual([...parseMarker(`Body\n\n${text}\n`)], [...agreed].sort(([x], [y]) => (x < y ? -1 : 1)));
  assert.equal(parseMarker("no marker"), null);
  assert.equal(parseMarker('<!-- bp-agreed:{"v":3,"a":{}} -->'), null);
  assert.equal(parseMarker('<!-- bp-agreed:{"v":2,"a":{"x":"nothex"}} -->'), null);
  assert.equal(parseMarker("<!-- bp-agreed:{not json} -->"), null);
  assert.deepEqual([...parseMarker(formatMarker(new Map()))], []);
  assert.equal(UNSET.status, "?");
});
