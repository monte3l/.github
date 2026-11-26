// SPDX-FileCopyrightText: Copyright (c) 2026 Enrico Lionello (enri3l) and Giulia Montevecchi (giulmonte), monte3l
// SPDX-License-Identifier: MIT

// .github/workflows/bestpractices-sync.yml is read as text, as freshness-public.test.mjs does. This
// repository is public, so its run page must say how many projects, never which one or which
// criterion, and the App's token must reach only the steps that write.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const text = readFileSync(path.join(import.meta.dirname, "..", ".github", "workflows", "bestpractices-sync.yml"), "utf8");
// Comments carry prose and examples, not behaviour.
const code = text
  .split("\n")
  .filter((line) => !/^\s*#/.test(line))
  .join("\n");

/** The text of the step whose `name:` or first line matches. */
function step(name) {
  const parts = code.split(/\n(?=\s+- )/);
  const found = parts.find((p) => p.includes(name));
  assert.ok(found, `no step "${name}"`);
  return found;
}

test("nothing is granted at the top, and every job states what it needs", () => {
  assert.match(code, /^permissions: \{\}$/m);
  assert.match(code, /concurrency:\n\s+group: bestpractices-sync\n\s+cancel-in-progress: false/);
  for (const job of ["plan", "act", "unchecked"]) {
    const block = code.slice(code.indexOf(`\n  ${job}:`));
    assert.match(block, /timeout-minutes: \d+/, `${job} has a timeout`);
    assert.match(block, /permissions:/, `${job} states its permissions`);
  }
});

test("every action is pinned to a full commit SHA with a version comment", () => {
  const uses = [...code.matchAll(/^\s+(?:- )?uses: (\S+)(.*)$/gm)];
  assert.ok(uses.length >= 4);
  for (const [, ref, rest] of uses) {
    assert.match(ref, /@[0-9a-f]{40}$/, `${ref} is not pinned`);
    assert.match(rest, /# v\d/, `${ref} has no version comment`);
  }
  for (const [block] of code.matchAll(/uses: actions\/checkout@[^\n]*\n(?:\s+(?:with|path|fetch-depth|repository|token|persist-credentials):[^\n]*\n)+/g)) {
    assert.match(block, /persist-credentials: false/, "a checkout keeps no credential");
  }
});

test("the plan prints no names: --json goes to a file, the summary is counts, the matrix is indexes", () => {
  const plan = step("List the projects that need something done");
  assert.match(plan, /node bin\/bestpractices-sync\.mjs "\$\{args\[@\]\}" >plan\.json/);
  assert.ok(!/\bcat plan\.json\b/.test(plan), "the plan is never printed");
  // The job output may name repositories (an output is not a log line); the summary may not.
  const start = plan.indexOf("echo '### OpenSSF Best Practices answers'");
  const end = plan.indexOf('} >>"$GITHUB_STEP_SUMMARY"');
  assert.ok(start > 0 && end > start, "the summary block was found");
  const summary = plan.slice(start, end);
  assert.match(summary, /\.state == "in-sync"/, "the summary counts by state");
  assert.ok(!/\.repo\b|\.siteAhead|\.repoAhead|\.conflicts|\.invalid|\.error\b/.test(summary), "the summary reads states only");
  assert.match(code, /index: \$\{\{ fromJSON\(needs\.plan\.outputs\.indexes\) \}\}/);
  assert.match(code, /name: Sync a project\n/);
  assert.ok(!/name: .*\$\{\{ *(matrix|env\.REPOSITORY)/.test(code), "no job or step name holds a repository");
});

test("each App token reaches one step, and each is scoped to one repository and its own permissions", () => {
  assert.equal([...code.matchAll(/GH_TOKEN: \$\{\{ steps\.app-token\.outputs\.token \}\}/g)].length, 1, "only the pull request step");
  assert.equal([...code.matchAll(/GH_TOKEN: \$\{\{ steps\.issues-token\.outputs\.token \}\}/g)].length, 1, "only the issue step");
  assert.match(step("Open the pull request"), /steps\.app-token\.outputs\.token/);
  assert.match(step("Write the tracking issue"), /steps\.issues-token\.outputs\.token/);
  assert.match(step("Write the site's answers into the file"), /GH_TOKEN: \$\{\{ github\.token \}\}/);
  assert.equal([...code.matchAll(/repositories: \$\{\{ env\.REPOSITORY_NAME \}\}/g)].length, 2, "both tokens name the one repository");
  const issues = step("Mint an issues-only token");
  assert.match(issues, /permission-issues: write/);
  assert.ok(!/permission-(contents|pull-requests)/.test(issues), "the issues token holds nothing else");
  assert.ok(!/permission-issues/.test(step("Mint a token for this repository only")), "the pull request token cannot write issues");
  assert.match(code, /max-parallel: 1/, "the one-a-second pace holds only inside a process");
  assert.ok(!/permission-workflows/.test(code), "this job never needs to change a workflow");
});

test("the act job is the only one in the environment, only for the org, never for a dry run", () => {
  assert.match(code, /environment: bestpractices-sync/);
  assert.equal([...code.matchAll(/^\s+environment:/gm)].length, 1);
  assert.match(code, /if: \$\{\{ github\.repository_owner == 'monte3l' && !\(github\.event_name == 'workflow_dispatch' && inputs\.dry_run\)/);
  assert.match(code, /DRY_RUN: \$\{\{ github\.event_name == 'workflow_dispatch' && inputs\.dry_run \}\}/, "a scheduled run is a real run");
  assert.match(code, /dry_run:\n(?:\s+\w+:.*\n)*?\s+default: true/);
});

test("a project that could not be checked fails the run after the others were handled", () => {
  const job = code.slice(code.indexOf("\n  unchecked:"));
  assert.match(job, /needs: \[plan, act\]/);
  assert.match(job, /always\(\)/);
  assert.match(job, /needs\.plan\.outputs\.errors != '0'/);
  assert.match(job, /exit 1/);
  assert.ok(!/\$\{\{ *needs\.plan\.outputs\.repositories/.test(job), "the failure message names no project");
});

test("it runs daily and the tracking issue is written even when the pull request step fails", () => {
  assert.match(code, /cron: "30 5 \* \* \*"/);
  assert.match(step("Write the tracking issue"), /if: \$\{\{ !cancelled\(\) \}\}/);
});
