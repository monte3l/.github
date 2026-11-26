// SPDX-FileCopyrightText: Copyright (c) 2026 Enrico Lionello (enri3l) and Giulia Montevecchi (giulmonte), monte3l
// SPDX-License-Identifier: MIT

/**
 * Pure functions for keeping a repository's `.bestpractices.json` and its
 * bestpractices.dev project in step. No network, no files: the CLI
 * (`bin/bestpractices-sync.mjs`) feeds these and does the I/O, so every rule
 * here is a plain function the tests can call.
 *
 * An answer is `{ status, justification }`. Status is one of `?`, `Unmet`,
 * `N/A`, `Met`. A criterion that is absent on a side is the unset answer
 * (`?` and an empty justification), because the site ignores `?` in the file.
 */

import { createHash } from "node:crypto";

export const UNSET = Object.freeze({ status: "?", justification: "" });

/** BadgeApp's internal integers (app/models/project.rb: 0=?, 1=Unmet, 2=N/A, 3=Met). */
const STATUS_BY_INT = ["?", "Unmet", "N/A", "Met"];
const STATUS_BY_TEXT = new Map([
  ["?", "?"],
  ["unknown", "?"],
  ["unmet", "Unmet"],
  ["n/a", "N/A"],
  ["met", "Met"],
]);

/** Metal levels are keyed '0', '1', '2' in criteria.yml. */
const METAL_SECTIONS = ["passing", "silver", "gold"];

/**
 * The "Prerequisites" criteria (`achieve_passing`, `achieve_silver`) are listed
 * in criteria.yml but BadgeApp sets them itself from the level below
 * (app/models/project.rb). A file never carries them and a proposal cannot
 * change them, so they are not synced.
 */
const DERIVED = /^achieve_(passing|silver|gold)$/;

/** Longest proposal URL we send. The site answers 414 above Heroku's 8192-byte request line. */
export const MAX_URL = 6000;

/**
 * The site's JSON spells a criterion `OSPS-AC-01.01_status`; the file and the
 * proposal URLs use `osps_ac_01_01_status`. Everything is compared in the
 * second form.
 */
export function normKey(key) {
  return String(key).toLowerCase().replace(/[.-]/g, "_");
}

/** Canonical status, or null when the value is not one the site knows. */
export function normStatus(value) {
  if (value === undefined || value === null) return "?";
  if (typeof value === "number") return STATUS_BY_INT[value] ?? null;
  return STATUS_BY_TEXT.get(String(value).trim().toLowerCase()) ?? null;
}

/** CRLF becomes LF and trailing whitespace goes; any other difference counts. */
export function normJustification(value) {
  if (value === undefined || value === null) return "";
  return String(value).replace(/\r\n?/g, "\n").replace(/\s+$/, "");
}

/**
 * Reads the criteria out of the upstream YAML without a YAML parser (this
 * repository takes no dependencies). Only two shapes are handled; the tests
 * use excerpts of both, and the CLI checks the totals at run time (see
 * `bin/bestpractices-sync.mjs`):
 *
 *   criteria.yml           `- '0': !!omap` levels, then `- name:` blocks
 *   baseline_criteria.yml  `baseline-N:` levels, then `      name:` blocks
 *
 * A block counts as a criterion only once its `category:` line is seen, so a
 * group heading never becomes one. Returns Map name -> { section, naAllowed,
 * obsolete }.
 */
export function parseCriteria(metalYaml, baselineYaml) {
  const criteria = new Map();
  const scan = (text, isLevel, isCriterion, naIndent) => {
    let section = null;
    let current = null;
    for (const line of text.split("\n")) {
      const level = isLevel(line);
      if (level) {
        section = level;
        current = null;
        continue;
      }
      const name = isCriterion(line);
      if (name) {
        current = { name, section, naAllowed: false, obsolete: false, confirmed: false };
        continue;
      }
      if (!current) continue;
      if (/^\s+category:/.test(line)) {
        current.confirmed = true;
        criteria.set(current.name, current);
      } else if (naIndent.test(line)) {
        current.naAllowed = true;
      } else if (/^\s+obsolete:\s*true\b/.test(line)) {
        current.obsolete = true;
      }
    }
  };
  scan(
    metalYaml,
    (line) => {
      const m = /^- '(\d)':/.exec(line);
      return m ? (METAL_SECTIONS[Number(m[1])] ?? null) : null;
    },
    (line) => /^\s+- ([a-z0-9_]+):(?:\s+#.*)?\s*$/.exec(line)?.[1],
    /^\s+na_allowed:\s*true\b/,
  );
  scan(
    baselineYaml,
    (line) => /^(baseline-\d):/.exec(line)?.[1],
    (line) => /^ {6}([a-z0-9_]+):(?:\s+#.*)?\s*$/.exec(line)?.[1],
    /^\s+na_allowed:\s*true\b/,
  );
  const out = new Map();
  for (const [name, c] of criteria) {
    if (DERIVED.test(name) || c.obsolete) continue; // a retired criterion is neither synced nor proposed
    out.set(name, { section: c.section, naAllowed: c.naAllowed, obsolete: c.obsolete });
  }
  return out;
}

/**
 * The baseline file states its own size (`total_controls`). A scanner that
 * misreads the file would silently stop syncing criteria, so the CLI compares
 * this with what `parseCriteria` found and fails the run on a mismatch.
 */
export function baselineTotal(baselineYaml) {
  const match = /^\s+total_controls:\s*(\d+)\s*$/m.exec(baselineYaml);
  return match ? Number(match[1]) : null;
}

/**
 * Collects the answers a JSON object holds, for the criteria that exist.
 * Works for both the site's project JSON and the repository file. `invalid`
 * lists criteria whose status the site would reject (an unknown word, or `N/A`
 * where the criterion forbids it): they are reported and never synced.
 */
export function readAnswers(object, criteria) {
  const view = new Map();
  for (const [key, value] of Object.entries(object ?? {})) view.set(normKey(key), value);
  const answers = new Map();
  const invalid = [];
  for (const [name, info] of criteria) {
    const rawStatus = view.get(`${name}_status`);
    const rawJustification = view.get(`${name}_justification`);
    if (rawStatus === undefined && rawJustification === undefined) continue;
    const status = normStatus(rawStatus);
    if (status === null || (status === "N/A" && !info.naAllowed)) {
      invalid.push(name);
      continue;
    }
    const answer = { status, justification: normJustification(rawJustification) };
    if (answer.status !== "?" || answer.justification !== "") answers.set(name, answer);
  }
  return { answers, invalid };
}

/** Ten hex digits: enough that a collision among a few hundred answers is not a concern. */
export function hashAnswer(answer = UNSET) {
  return createHash("sha256").update(`${answer.status}\0${answer.justification}`).digest("hex").slice(0, 10);
}

/**
 * The three-way comparison. `agreed` is a Map name -> hash of the answer both
 * sides last held; a criterion it lacks was unset then.
 *
 * | file vs agreed | site vs agreed | outcome   |
 * | equal to site  | any            | inSync    |
 * | unchanged      | changed        | siteAhead |
 * | changed        | unchanged      | repoAhead |
 * | changed        | changed        | conflict  |
 */
export function classify(fileAnswers, siteAnswers, agreed, criteria, skip = new Set()) {
  const out = { inSync: [], siteAhead: [], repoAhead: [], conflicts: [] };
  const base = hashAnswer(UNSET);
  for (const name of criteria.keys()) {
    // An answer the site would reject reads as unset, which would look like a change.
    if (skip.has(name)) continue;
    const file = hashAnswer(fileAnswers.get(name));
    const site = hashAnswer(siteAnswers.get(name));
    if (file === site) {
      out.inSync.push(name);
      continue;
    }
    const was = agreed.get(name) ?? base;
    const fileMoved = file !== was;
    const siteMoved = site !== was;
    if (!fileMoved) out.siteAhead.push(name);
    else if (!siteMoved) out.repoAhead.push(name);
    else out.conflicts.push(name);
  }
  return out;
}

/**
 * The snapshot to store after a run: the criteria on which the two sides agree
 * now, keeping the old base for every one still open so it is judged against
 * the same point next time.
 */
export function nextAgreed(fileAnswers, siteAnswers, outcome, agreed, skip = new Set()) {
  const next = new Map();
  for (const name of skip) if (agreed.has(name)) next.set(name, agreed.get(name));
  for (const name of outcome.inSync) {
    const answer = siteAnswers.get(name);
    if (answer) next.set(name, hashAnswer(answer));
  }
  for (const name of [...outcome.siteAhead, ...outcome.repoAhead, ...outcome.conflicts]) {
    if (agreed.has(name)) next.set(name, agreed.get(name));
  }
  return next;
}

/** The file's answers with the site's value for each named criterion. */
export function applySiteAhead(fileAnswers, siteAnswers, names) {
  const merged = new Map(fileAnswers);
  for (const name of names) {
    const answer = siteAnswers.get(name);
    if (answer) merged.set(name, answer);
    else merged.delete(name);
  }
  return merged;
}

/**
 * The file text for `answers`: every key that is not a criterion stays as it
 * was, criterion keys are rewritten in the lowercase form, keys sorted, two
 * spaces, trailing newline. The same input always gives the same bytes, so a
 * rerun does not push a new commit.
 */
export function renderFile(existing, answers, criteria) {
  const kept = {};
  for (const [key, value] of Object.entries(existing ?? {})) {
    const norm = normKey(key);
    const isCriterion = [...criteria.keys()].some((name) => norm === `${name}_status` || norm === `${name}_justification`);
    if (!isCriterion) kept[key] = value;
  }
  for (const [name, answer] of answers) {
    kept[`${name}_status`] = answer.status;
    if (answer.justification !== "") kept[`${name}_justification`] = answer.justification;
  }
  const sorted = Object.fromEntries(Object.entries(kept).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  return `${JSON.stringify(sorted, null, 2)}\n`;
}

/**
 * Proposal links for the criteria the file is ahead on. One link per section
 * (the site ignores a field from another section), each forcing exactly its
 * own keys with `overrides=`, split so none passes MAX_URL. A criterion whose
 * justification alone is too long for one link is returned in `oversize`.
 */
export function proposalUrls(base, projectId, names, fileAnswers, criteria) {
  const bySection = new Map();
  for (const name of names) {
    const section = criteria.get(name)?.section;
    if (!section) continue;
    if (!bySection.has(section)) bySection.set(section, []);
    bySection.get(section).push(name);
  }
  const urls = [];
  const oversize = [];
  for (const [section, sectionNames] of bySection) {
    const head = `${base}/en/projects/${projectId}/${section}/edit?`;
    let pairs = [];
    let keys = [];
    const flush = () => {
      if (pairs.length === 0) return;
      urls.push({ section, count: keys.length / 2, url: `${head}${pairs.join("&")}&overrides=${keys.join(",")}` });
      pairs = [];
      keys = [];
    };
    const length = () => head.length + pairs.join("&").length + "&overrides=".length + keys.join(",").length;
    for (const name of sectionNames) {
      const answer = fileAnswers.get(name) ?? UNSET;
      const add = [
        `${name}_status=${encodeURIComponent(answer.status)}`,
        `${name}_justification=${encodeURIComponent(answer.justification)}`,
      ];
      const addKeys = [`${name}_status`, `${name}_justification`];
      const alone = head.length + add.join("&").length + "&overrides=".length + addKeys.join(",").length;
      if (alone > MAX_URL) {
        oversize.push(name);
        continue;
      }
      const extra = add.join("&").length + addKeys.join(",").length + 2;
      if (pairs.length > 0 && length() + extra > MAX_URL) flush();
      pairs.push(...add);
      keys.push(...addKeys);
    }
    flush();
  }
  return { urls, oversize };
}

const MARKER = /<!-- bp-agreed:(\{.*?\}) -->/gs;

/** The hidden snapshot line stored in a project's tracking issue. */
export function formatMarker(agreed) {
  const a = Object.fromEntries([...agreed].sort(([x], [y]) => (x < y ? -1 : 1)));
  return `<!-- bp-agreed:${JSON.stringify({ v: 1, a })} -->`;
}

/**
 * The snapshot, or null when the marker is missing or not what we wrote. The
 * last marker counts: ours is written at the end, after any answer text that
 * might itself contain one.
 */
export function parseMarker(body) {
  const matches = [...(body ?? "").matchAll(MARKER)];
  const match = matches.at(-1);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]);
    if (parsed?.v !== 1 || typeof parsed.a !== "object" || parsed.a === null || Array.isArray(parsed.a)) return null;
    const out = new Map();
    for (const [name, hash] of Object.entries(parsed.a)) {
      if (typeof hash !== "string" || !/^[0-9a-f]{10}$/.test(hash)) return null;
      out.set(name, hash);
    }
    return out;
  } catch {
    return null;
  }
}
