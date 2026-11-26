#!/usr/bin/env node
// SPDX-FileCopyrightText: Copyright (c) 2026 Enrico Lionello (enri3l) and Giulia Montevecchi (giulmonte), monte3l
// SPDX-License-Identifier: MIT

/**
 * Compares each registered project's `.bestpractices.json` with its
 * bestpractices.dev entry, criterion by criterion, and closes the gaps.
 *
 *   node bin/bestpractices-sync.mjs [--repos a,b] [--owner OWNER] [--json] [--check] [--public] [--findings FILE]
 *   node bin/bestpractices-sync.mjs --repos NAME --write DIR
 *   node bin/bestpractices-sync.mjs --repos NAME --issue
 *
 * Which side wins is decided per criterion against the last answer both sides
 * held (see `bin/lib/bestpractices.mjs` and `blueprint/README.md`, "OpenSSF
 * Best Practices sync"):
 *
 *   site ahead  the file takes the site's answer, through a pull request
 *   repo ahead  a proposal link goes into the project's tracking issue: the
 *               site only saves an answer when a logged-in person clicks Save
 *   conflict    both moved and differ: the issue lists both, nothing is changed
 *
 * With no mode flag it only reads and prints. --write DIR writes the file into
 * a checkout at DIR when the site is ahead (the pull request is opened by
 * `bin/bestpractices-sync-pr.sh`). --issue opens, rewrites or closes the
 * tracking issue in the project's repository; it needs a token with issues
 * write there. --json prints the full result, names included, for the workflow
 * plan. --check exits 1 when a person has something to do, 3 when a project
 * could not be checked. --public prints counts only and cannot be combined
 * with --json, --write or --issue.
 *
 * In a workflow run (GITHUB_ACTIONS=true) the log of a public repository is
 * readable by anyone, so nothing printed names a repository, a criterion or
 * the text of a failed call.
 *
 * Environment: BESTPRACTICES_BASE_URL (default https://www.bestpractices.dev)
 * and BESTPRACTICES_DELAY_MS (default 1000, the pace the site asks for) exist
 * for the tests.
 *
 * Exit codes: 0 clean, 1 something for a person (--check), 2 usage, 3 a call
 * failed.
 */

import { execFileSync } from "node:child_process";
import { closeSync, constants, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, realpathSync, rmSync, writeFileSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  applySiteAhead,
  baselineTotal,
  classify,
  formatMarker,
  hashAnswer,
  nextAgreed,
  parseCriteria,
  parseMarker,
  proposalUrls,
  readAnswers,
  renderFile,
} from "./lib/bestpractices.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const USAGE = `usage: node bin/bestpractices-sync.mjs [--repos a,b] [--owner OWNER] [--json] [--check] [--public] [--findings FILE]
       node bin/bestpractices-sync.mjs --repos NAME --write DIR
       node bin/bestpractices-sync.mjs --repos NAME --issue`;

export const ISSUE_TITLE = "OpenSSF Best Practices sync";
export const ISSUE_LABEL = "bestpractices-sync";
const FILE_PATHS = [".bestpractices.json", ".project.d/bestpractices.json"];
const CRITERIA_REPO = "ossf/best-practices-badge";

class CliError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/** One project's failure: reported in its result, never stops the others. */
class RepoError extends Error {}

function parseArgs(argv) {
  const opts = { owner: "monte3l", repos: null, json: false, check: false, public: false, findings: null, write: null, issue: false };
  const value = (i) => {
    if (i + 1 >= argv.length) throw new CliError(2, `${argv[i]} needs a value\n${USAGE}`);
    return argv[i + 1];
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") opts.json = true;
    else if (a === "--check") opts.check = true;
    else if (a === "--public") opts.public = true;
    else if (a === "--issue") opts.issue = true;
    else if (a === "--owner") opts.owner = value(i++);
    else if (a === "--repos") opts.repos = value(i++).split(",").filter(Boolean);
    else if (a === "--findings") opts.findings = value(i++);
    else if (a === "--write") opts.write = value(i++);
    else throw new CliError(2, `unknown argument ${a}\n${USAGE}`);
  }
  if (opts.public && (opts.json || opts.write !== null || opts.issue)) {
    throw new CliError(2, `--public prints counts only, so it cannot be combined with --json, --write or --issue\n${USAGE}`);
  }
  if ((opts.write !== null || opts.issue) && (opts.repos === null || opts.repos.length !== 1)) {
    throw new CliError(2, `--write and --issue need --repos with exactly one repository\n${USAGE}`);
  }
  if (!/^[A-Za-z0-9._-]+$/.test(opts.owner)) throw new CliError(2, `invalid owner\n${USAGE}`);
  for (const name of opts.repos ?? []) {
    if (!/^[A-Za-z0-9._-]+$/.test(name)) throw new CliError(2, `invalid repository name ${name}\n${USAGE}`);
  }
  return opts;
}

// ---- gh -----------------------------------------------------------------

function gh(args, input) {
  return execFileSync("gh", args, {
    encoding: "utf8",
    input,
    stdio: ["pipe", "pipe", "pipe"],
    maxBuffer: 32 * 1024 * 1024,
  });
}

const isNotFound = (error) => /HTTP 404|Not Found/i.test(String(error.stderr ?? error.message));

/** The file's text at `ref`, or null when it does not exist. */
function ghFile(repo, file, ref) {
  const query = ref ? `?ref=${encodeURIComponent(ref)}` : "";
  try {
    return gh(["api", "-H", "Accept: application/vnd.github.raw+json", `repos/${repo}/contents/${file}${query}`]);
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

function listRepositories(owner) {
  const out = gh([
    "api",
    "--paginate",
    `orgs/${owner}/repos?type=public&per_page=100`,
    "--jq",
    ".[] | select(.archived | not) | select(.fork | not) | .name",
  ]);
  return out.split("\n").filter(Boolean).sort();
}

function exemptRepositories() {
  try {
    return Object.keys(JSON.parse(readFileSync(path.join(ROOT, "blueprint/openssf.json"), "utf8")).exempt ?? {});
  } catch {
    return [];
  }
}

function loadCriteria() {
  const upstream = JSON.parse(readFileSync(path.join(ROOT, "blueprint/upstream.json"), "utf8"));
  const entry = upstream.find((e) => e.name === "OpenSSF Best Practices criteria");
  const ref = entry?.reviewed;
  if (!ref) throw new CliError(3, "blueprint/upstream.json has no reviewed commit for the OpenSSF Best Practices criteria");
  const metal = ghFile(CRITERIA_REPO, "criteria/criteria.yml", ref);
  const baseline = ghFile(CRITERIA_REPO, "criteria/baseline_criteria.yml", ref);
  if (metal === null || baseline === null) throw new CliError(3, "the criteria files are missing at the reviewed commit");
  const criteria = parseCriteria(metal, baseline);
  const found = [...criteria.values()].filter((c) => c.section.startsWith("baseline-")).length;
  if (found !== baselineTotal(baseline)) {
    throw new CliError(3, "the criteria scanner and the baseline file disagree on how many controls there are");
  }
  return criteria;
}

// ---- bestpractices.dev ----------------------------------------------------

const baseUrl = () => (process.env.BESTPRACTICES_BASE_URL || "https://www.bestpractices.dev").replace(/\/+$/, "");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let lastRequest = 0;

async function siteGet(url) {
  const delay = Number(process.env.BESTPRACTICES_DELAY_MS ?? 1000);
  const wait = lastRequest + delay - Date.now();
  if (lastRequest !== 0 && wait > 0) await sleep(wait);
  lastRequest = Date.now();
  let response;
  try {
    response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "monte3l-bestpractices-sync" },
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new RepoError("bestpractices.dev could not be reached");
  }
  if (!response.ok) throw new RepoError(`bestpractices.dev answered ${response.status}`);
  try {
    return await response.json();
  } catch {
    throw new RepoError("bestpractices.dev sent something that is not JSON");
  }
}

const normUrl = (u) => String(u ?? "").trim().replace(/\/+$/, "").replace(/\.git$/, "").toLowerCase();

/**
 * Every project registered for `repoUrl`. The site's word alone is not enough to
 * trust one: its answers become text in a pull request and an issue here, so the
 * caller picks the one the repository's own README badge names.
 */
async function lookupProjects(repoUrl) {
  const list = await siteGet(`${baseUrl()}/projects.json?url=${encodeURIComponent(repoUrl)}`);
  if (!Array.isArray(list)) throw new RepoError("bestpractices.dev sent an unexpected shape");
  return list.filter((p) => normUrl(p?.repo_url) === normUrl(repoUrl));
}

// ---- one repository ---------------------------------------------------------

function readmeBadgeId(repo) {
  let readme;
  try {
    readme = gh(["api", "-H", "Accept: application/vnd.github.raw+json", `repos/${repo}/readme`]);
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
  return /bestpractices\.dev\/projects\/(\d+)/.exec(readme)?.[1] ?? null;
}

function findIssue(repo) {
  const rows = JSON.parse(
    gh(["issue", "list", "-R", repo, "--state", "all", "--label", ISSUE_LABEL, "--limit", "20", "--json", "number,title,state,body"]),
  );
  return rows.find((row) => row.title === ISSUE_TITLE) ?? null;
}

function describe(answer) {
  if (!answer) return "unset";
  return answer.justification === "" ? answer.status : `${answer.status}: ${answer.justification}`;
}

// `<` is escaped so an answer's text can never form a snapshot marker or any other HTML comment.
// The backslash goes first: otherwise an answer holding `\|` becomes `\\|`, an escaped backslash
// followed by a bare pipe, which ends the cell.
const cell = (text) => String(text).replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\n/g, " ").replace(/</g, "&lt;");

function buildIssueBody(result, owner) {
  const lines = [
    "This issue is kept by `bin/bestpractices-sync.mjs` in `monte3l/.github`. It keeps `.bestpractices.json` and the project's answers on bestpractices.dev in step, one criterion at a time. Do not edit it: the next run rewrites it.",
    "",
  ];
  if (result.repoAhead.length > 0) {
    lines.push(
      "## Changed in the file, not yet saved on the site",
      "",
      "bestpractices.dev only saves an answer when a logged-in person submits the form, so each link below opens the form with these answers filled in. Open it and click **Save**. The next run sees the match and closes this issue.",
      "",
    );
    for (const { section, count, url } of result.proposals.urls) lines.push(`- [${section}: ${count} answer${count === 1 ? "" : "s"}](${url})`);
    lines.push("", "| Criterion | On the site | In the file |", "| --- | --- | --- |");
    for (const name of result.repoAhead) lines.push(`| \`${name}\` | ${cell(describe(result.site.get(name)))} | ${cell(describe(result.file.get(name)))} |`);
    lines.push("");
    if (result.proposals.oversize.length > 0) {
      lines.push(
        "> [!NOTE]",
        `> A justification is too long for a link (${result.proposals.oversize.map((n) => `\`${n}\``).join(", ")}). Paste it from the file into the form by hand.`,
        "",
      );
    }
  }
  if (result.conflicts.length > 0) {
    lines.push(
      "## Changed on both sides",
      "",
      "> [!WARNING]",
      "> The file and the site both moved since they last agreed, and they differ. Nothing is changed. Edit either side so they match.",
      "",
      "| Criterion | On the site | In the file |",
      "| --- | --- | --- |",
    );
    for (const name of result.conflicts) lines.push(`| \`${name}\` | ${cell(describe(result.site.get(name)))} | ${cell(describe(result.file.get(name)))} |`);
    lines.push("");
  }
  if (result.invalid.length > 0) {
    lines.push(
      "## Answers the site would reject",
      "",
      `The file holds a status the site does not accept for ${result.invalid.map((n) => `\`${n}\``).join(", ")} (an unknown word, or \`N/A\` where it is not allowed). They are skipped until fixed, and the file is not rewritten while any remain.`,
      "",
    );
  }
  if (result.siteAhead.length > 0) {
    lines.push(
      "## Changed on the site, waiting for a pull request",
      "",
      `A pull request from \`monte3l-sync\` brings ${result.siteAhead.length} answer${result.siteAhead.length === 1 ? "" : "s"} into the file. Review and merge it.`,
      "",
    );
  }
  lines.push(`Project: ${baseUrl()}/projects/${result.id}`, "", formatMarker(result.nextAgreed));
  void owner;
  return lines.join("\n");
}

async function inspect(owner, name, criteria) {
  const repo = `${owner}/${name}`;
  const result = { repo: name, state: "in-sync", id: null, siteAhead: [], repoAhead: [], conflicts: [], invalid: [], inSync: [], needsAction: false, pending: false };
  try {
    const matches = await lookupProjects(`https://github.com/${repo}`);
    if (matches.length === 0) return { ...result, state: "not-registered" };
    // A project is trusted only when the repository itself names it: anyone can claim a URL on the
    // site, but only someone who can commit here can put the badge in the README. With several
    // matches the badge also says which one is meant.
    const badge = readmeBadgeId(repo);
    if (badge === null) throw new RepoError("no README badge ties this repository to a project");
    const project = matches.find((p) => String(p.id) === String(badge));
    if (!project) throw new RepoError("the README badge points at another project");
    result.id = project.id;

    const present = FILE_PATHS.filter((p) => ghFile(repo, p) !== null);
    if (present.length > 1) throw new RepoError("both answer files exist");
    result.filePath = present[0] ?? FILE_PATHS[0];
    const text = present.length === 1 ? ghFile(repo, present[0]) : null;
    let object = null;
    if (text !== null) {
      try {
        object = JSON.parse(text);
      } catch {
        throw new RepoError("the answer file is not valid JSON");
      }
      if (object === null || typeof object !== "object" || Array.isArray(object)) throw new RepoError("the answer file is not a JSON object");
    }
    const file = readAnswers(object, criteria);
    const site = readAnswers(project, criteria);
    result.file = file.answers;
    result.site = site.answers;
    result.invalid = file.invalid;

    const issue = findIssue(repo);
    result.issue = issue;
    let agreed = issue ? parseMarker(issue.body) : null;
    // With no snapshot nothing is assumed: the last agreed answer is "unset" for every criterion. An
    // answer on one side only goes to the other side, and an answer on both sides that differs is a
    // conflict for a person, once. Guessing which side is newer (from the site's last edit, say) put
    // the site's older wording over a better one in the file, and pruned answers the site never had.
    if (agreed === null) agreed = new Map();

    const skip = new Set([...file.invalid, ...site.invalid]);
    const outcome = classify(file.answers, site.answers, agreed, criteria, skip);
    Object.assign(result, outcome);
    result.nextAgreed = nextAgreed(file.answers, site.answers, outcome, agreed, skip);
    result.proposals = proposalUrls(baseUrl(), project.id, outcome.repoAhead, file.answers, criteria);

    result.fileWrite = false;
    if (outcome.siteAhead.length > 0 && file.invalid.length === 0) {
      const next = renderFile(object, applySiteAhead(file.answers, site.answers, outcome.siteAhead), criteria);
      if (next !== text) {
        result.fileWrite = true;
        result.fileText = next;
      }
    }
    result.pending = outcome.repoAhead.length > 0 || outcome.conflicts.length > 0 || file.invalid.length > 0;
    result.issueBody = buildIssueBody(result, owner);
    const bodyChanged = issue !== null && issue.body.trim() !== result.issueBody.trim();
    // The snapshot is kept after every checked run, in an issue that is closed when nothing needs a
    // person: without it a later run guesses the base from the site's last edit, and a file change
    // made meanwhile can be taken for a site change.
    result.needsAction = result.fileWrite || result.pending || issue === null || issue.state === "OPEN" || bodyChanged;
    result.state = result.conflicts.length > 0 ? "conflict" : result.pending ? "repo-ahead" : outcome.siteAhead.length > 0 ? "site-ahead" : "in-sync";
    return result;
  } catch (error) {
    if (error instanceof RepoError) return { ...result, state: "error", error: error.message, needsAction: false };
    if (error instanceof CliError) throw error;
    // A failed gh call: the text names the repository, so it stays in the result only for a local run.
    return { ...result, state: "error", error: "a GitHub call failed", detail: String(error.stderr ?? error.message).trim().split("\n")[0], needsAction: false };
  }
}

// ---- actions --------------------------------------------------------------------

// `freshness` marks every issue a scheduled check opens (blueprint/tracking.md), so a search for what
// is waiting lists these too. `bestpractices-sync` is created here rather than by the baseline, which
// would otherwise report it missing in every repository, registered or not.
const ISSUE_LABELS = [ISSUE_LABEL, "freshness"];
const LABEL_DEFAULTS = {
  [ISSUE_LABEL]: { color: "b77610", description: "OpenSSF Best Practices answers kept in step with bestpractices.dev" },
  freshness: { color: "b77610", description: "A scheduled check found something to update" },
};

function ensureLabels(repo) {
  let fromBlueprint = [];
  try {
    fromBlueprint = JSON.parse(readFileSync(path.join(ROOT, "blueprint/labels.json"), "utf8"));
  } catch {
    // The defaults are fine.
  }
  for (const name of ISSUE_LABELS) {
    const { color, description } = fromBlueprint.find((l) => l.name === name) ?? LABEL_DEFAULTS[name];
    try {
      gh(["label", "create", name, "-R", repo, "--color", color, "--description", description]);
    } catch {
      // It exists already.
    }
  }
}

function upsertIssue(owner, result) {
  const repo = `${owner}/${result.repo}`;
  const dir = mkdtempSync(path.join(tmpdir(), "bp-sync-"));
  const bodyFile = path.join(dir, "body.md");
  try {
    writeFileSync(bodyFile, `${result.issueBody}\n`);
    const issue = result.issue;
    if (issue === null || issue === undefined) {
      ensureLabels(repo);
      const created = gh(["issue", "create", "-R", repo, "--title", ISSUE_TITLE, "--label", ISSUE_LABELS.join(","), "--body-file", bodyFile]).trim();
      if (result.pending) return "opened";
      // Nothing needs a person: the issue only holds the snapshot, so it is closed at once.
      gh(["issue", "close", created.split("\n").at(-1), "-R", repo, "--comment", "Nothing needs a person. This issue keeps the last agreed answers, and is reopened when something does."]);
      return "recorded";
    }
    const changed = issue.body.trim() !== result.issueBody.trim();
    if (changed) gh(["issue", "edit", String(issue.number), "-R", repo, "--body-file", bodyFile]);
    if (result.pending && issue.state === "CLOSED") {
      gh(["issue", "reopen", String(issue.number), "-R", repo, "--comment", "Something needs a person again. The description above is current."]);
      return "reopened";
    }
    if (!result.pending && issue.state === "OPEN") {
      gh(["issue", "close", String(issue.number), "-R", repo, "--comment", "Nothing needs a person now. The description above is current."]);
      return "closed";
    }
    if (changed && issue.state === "OPEN") {
      gh(["issue", "comment", String(issue.number), "-R", repo, "--body", "The findings changed. The description above is current."]);
      return "updated";
    }
    return changed ? "updated" : "unchanged";
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Writes `text` to `relative` inside the checkout `dir`. The checkout comes from the
 * project's repository, so what is in it is not trusted: a symlink committed at the answer
 * file's path, or at `.project.d`, would send this write to a file of the runner outside the
 * checkout (the tools are checked out next to it). Every part of the path is checked with
 * lstat, the real directory must stay inside the real checkout, and the file is opened with
 * O_NOFOLLOW so a link made between the check and the write is refused too.
 */
function writeInto(dir, relative, text) {
  const root = realpathSync(dir);
  const parts = relative.split("/");
  let current = root;
  for (const part of parts) {
    current = path.join(current, part);
    let stat = null;
    try {
      stat = lstatSync(current);
    } catch {
      // It does not exist yet: it will be created below.
    }
    if (stat?.isSymbolicLink()) throw new CliError(3, "a path in the checkout is a symbolic link, so nothing is written");
    if (stat === null) break;
  }
  mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
  const real = realpathSync(path.dirname(path.join(root, relative)));
  if (real !== root && !real.startsWith(`${root}${path.sep}`)) throw new CliError(3, "the answer file's folder is outside the checkout, so nothing is written");
  const fd = openSync(path.join(real, parts.at(-1)), constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW, 0o644);
  try {
    writeSync(fd, text);
  } finally {
    closeSync(fd);
  }
}

// ---- output --------------------------------------------------------------------

const STATES = ["in-sync", "site-ahead", "repo-ahead", "conflict", "not-registered", "error"];

function counts(results) {
  const out = Object.fromEntries(STATES.map((s) => [s, 0]));
  for (const r of results) out[r.state] += 1;
  return out;
}

function countsText(results) {
  const c = counts(results);
  return [
    `${results.length - c["not-registered"]} registered projects checked`,
    `${c["in-sync"]} in sync`,
    `${c["site-ahead"]} with a site change waiting for a pull request`,
    `${c["repo-ahead"]} with a file change waiting for a Save on the site`,
    `${c.conflict} with a change on both sides`,
    `${c.error} that could not be checked`,
    `${c["not-registered"]} not registered`,
  ].join("\n");
}

function table(results) {
  const rows = [["repository", "project", "state", "site ahead", "repo ahead", "conflicts", "in sync"]];
  for (const r of results) {
    rows.push([r.repo, r.id ?? "-", r.error ? `error: ${r.detail ?? r.error}` : r.state, r.siteAhead.length, r.repoAhead.length, r.conflicts.length, r.inSync.length].map(String));
  }
  const widths = rows[0].map((_, i) => Math.max(...rows.map((row) => row[i].length)));
  return rows.map((row) => row.map((c, i) => c.padEnd(widths[i])).join("  ").trimEnd()).join("\n");
}

// ---- main ----------------------------------------------------------------------

export async function main(argv) {
  const opts = parseArgs(argv);
  const inCi = process.env.GITHUB_ACTIONS === "true";
  const quiet = opts.public || inCi;
  let criteria;
  let names;
  try {
    criteria = loadCriteria();
    const exempt = new Set(exemptRepositories());
    names = (opts.repos ?? listRepositories(opts.owner)).filter((n) => !exempt.has(n));
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError(3, quiet ? "a read failed (run it by hand for the detail)" : `a read failed: ${String(error.stderr ?? error.message).trim().split("\n")[0]}`);
  }

  const results = [];
  for (const name of names) results.push(await inspect(opts.owner, name, criteria));
  const checked = results.filter((r) => r.state !== "not-registered");

  if (opts.write !== null) {
    const r = results[0];
    if (r.fileWrite) {
      writeInto(opts.write, r.filePath, r.fileText);
    }
    process.stdout.write(quiet ? `${r.fileWrite ? 1 : 0} file written\n` : `${r.repo}: ${r.fileWrite ? `wrote ${r.filePath}` : "nothing to write"}\n`);
  } else if (opts.issue) {
    const r = results[0];
    if (r.state === "error" || r.state === "not-registered") {
      process.stdout.write(quiet ? `issue not updated: ${r.state}\n` : `${r.repo}: issue not updated (${r.error ?? r.state})\n`);
    } else {
      const done = upsertIssue(opts.owner, r);
      process.stdout.write(quiet ? `issue ${done}\n` : `${r.repo}: issue ${done}\n`);
    }
  } else if (opts.json) {
    const plain = results.map((r) => ({
      repo: r.repo,
      state: r.state,
      id: r.id,
      needsAction: r.needsAction,
      pending: r.pending,
      error: r.error ?? null,
      siteAhead: r.siteAhead,
      repoAhead: r.repoAhead,
      conflicts: r.conflicts,
      invalid: r.invalid,
    }));
    process.stdout.write(`${JSON.stringify({ results: plain }, null, 2)}\n`);
  } else if (quiet) {
    process.stdout.write(`${countsText(results)}\n`);
  } else {
    process.stdout.write(`${table(checked)}\n\n${countsText(results)}\n`);
    for (const r of checked.filter((x) => x.error)) process.stdout.write(`${r.repo}: ${r.detail ?? r.error}\n`);
  }

  const findings = checked.filter((r) => r.pending || r.state === "error");
  if (opts.findings) writeFileSync(opts.findings, findings.length === 0 ? "" : `${countsText(results)}\n`);
  const failed = results.some((r) => r.state === "error");
  // A leg that writes must not pass quietly when its project could not be checked: the plan's count
  // only covers the plan's own run.
  const actFailed = (opts.write !== null || opts.issue) && failed;
  process.exitCode = actFailed ? 3 : opts.check ? (failed ? 3 : findings.length > 0 ? 1 : 0) : 0;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error instanceof CliError ? error.message : "unexpected failure"}\n`);
    process.exit(error instanceof CliError ? error.code : 3);
  });
}
