#!/usr/bin/env node
// SPDX-FileCopyrightText: Copyright (c) 2026 Enrico Lionello (enri3l) and Giulia Montevecchi (giulmonte), monte3l
// SPDX-License-Identifier: MIT

// Reports how the org Project differs from blueprint/project.json and, with
// --apply, sets what the GraphQL API allows: title, description, README, Status
// options, custom fields, issue fields, and each view's name, layout and filter.
// Group, sort, slice, roadmap dates, visible columns and the built-in workflows
// are not settable through the API, so they print as a checklist (SKIP).
//
//   project-config.mjs [--check | --apply [--yes]]
//
// Environment:
//   OWNER     the organization
//   PROJECT   the Project's number
//   PROJECT_CONFIG, PROJECTS_FILE   override the two blueprint files (tests)
//
// It runs by hand, never in a workflow. It never deletes a field, a view or an
// item. A view is matched by name, or by `renamedFrom` when it has not been
// renamed yet. Exit codes: 0 clean (or applied), 1 drift in --check, 2 usage or
// a missing tool, 3 any failed call.

import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";

const ROOT = path.join(import.meta.dirname, "..");
const CONFIG = process.env.PROJECT_CONFIG ?? path.join(ROOT, "blueprint", "project.json");
const PROJECTS = process.env.PROJECTS_FILE ?? path.join(ROOT, "blueprint", "projects.json");

class Usage extends Error {}

export function parseArgs(argv) {
  const out = { apply: false, yes: false };
  for (const arg of argv) {
    if (arg === "--check") out.apply = false;
    else if (arg === "--apply") out.apply = true;
    else if (arg === "--yes") out.yes = true;
    else throw new Usage(`unknown argument: ${arg}`);
  }
  if (out.yes && !out.apply) throw new Usage("--yes only goes with --apply");
  return out;
}

// The README is the config's intro plus one row per registered project, so a
// new project shows up without anyone editing the Project.
export function composeReadme(config, projects) {
  const rows = projects.map((p) => {
    const base = p.repo === ".github" ? "monte3l/.github" : `monte3l/${p.repo}`;
    return `| [${p.repo}](https://github.com/${base}) | [Roadmap](https://github.com/${base}/blob/main/ROADMAP.md) | [Releases](https://github.com/${base}/releases) | [Issues](https://github.com/${base}/issues) |`;
  });
  return [
    config.readmeIntro,
    "",
    "| Repository | Roadmap | Releases | Issues |",
    "| --- | --- | --- | --- |",
    ...rows,
    "",
    "Questions and ideas: [Discussions](https://github.com/orgs/monte3l/discussions).",
  ].join("\n");
}

function gh(args, input) {
  return execFileSync("gh", args, { encoding: "utf8", input, stdio: ["pipe", "pipe", "inherit"] });
}

function gql(query, variables = {}) {
  const body = JSON.stringify({ query, variables });
  const res = JSON.parse(gh(["api", "graphql", "--input", "-"], body));
  if (res.errors?.length) throw new Error(`GraphQL: ${res.errors.map((e) => e.message).join("; ")}`);
  return res.data;
}

const LIVE = `query($owner: String!, $number: Int!) {
  organization(login: $owner) { projectV2(number: $number) {
    id title shortDescription readme
    fields(first: 50) { nodes {
      __typename
      ... on ProjectV2FieldCommon { id name dataType }
      ... on ProjectV2SingleSelectField { options { id name color description } }
    } }
    views(first: 50) { nodes { id name layout filter } }
  } }
}`;

const same = (a, b) => a.toLowerCase() === b.toLowerCase();

// The option list to send: in the wanted order, an existing option (matched
// case-insensitively) keeps its id, colour and description so that the values
// already set on items survive, and a new one starts grey.
export function mergeOptions(existing, wanted) {
  return wanted.map((name) => {
    const old = existing.find((o) => same(o.name, name));
    return old ? { id: old.id, name, color: old.color, description: old.description ?? "" } : { name, color: "GRAY", description: "" };
  });
}

// One line per item. `drift` is what --apply would fix, as a list of thunks.
export function plan(config, projects, live, orgIssueFields) {
  const lines = [];
  const todo = [];
  const add = (state, label, extra, fix) => {
    lines.push({ state, label, extra });
    if (fix) todo.push({ label, fix });
  };
  const project = live.id;

  // Title, description, README
  const readme = composeReadme(config, projects);
  for (const [key, label] of [["title", "title"], ["shortDescription", "description"]]) {
    if (live[key] === config[key]) add("OK", label);
    else add("DRIFT", label, `is "${live[key]}"`, () => gql(`mutation($input: UpdateProjectV2Input!) { updateProjectV2(input: $input) { projectV2 { id } } }`, { input: { projectId: project, [key]: config[key] } }));
  }
  if ((live.readme ?? "").trim() === readme.trim()) add("OK", "README");
  else add("DRIFT", "README", "differs from the config and blueprint/projects.json", () => gql(`mutation($input: UpdateProjectV2Input!) { updateProjectV2(input: $input) { projectV2 { id } } }`, { input: { projectId: project, readme } }));

  const fields = live.fields.nodes.filter((f) => f.name);
  const byName = (name) => fields.find((f) => same(f.name, name));

  // Status: keep an existing option's id (matched case-insensitively) so values survive.
  const status = byName("Status");
  if (!status?.options) {
    add("DRIFT", "Status field", "missing or not a single select");
  } else {
    const have = status.options.map((o) => o.name);
    if (JSON.stringify(have) === JSON.stringify(config.status)) add("OK", "Status options");
    else add("DRIFT", "Status options", `are ${have.join(", ")}`, () => {
      gql(`mutation($input: UpdateProjectV2FieldInput!) { updateProjectV2Field(input: $input) { projectV2Field { ... on ProjectV2SingleSelectField { id } } } }`, { input: { fieldId: status.id, name: status.name, singleSelectOptions: mergeOptions(status.options, config.status) } });
    });
  }

  // Custom fields: created when missing, options added when missing, never removed.
  for (const want of config.fields) {
    const got = byName(want.name);
    if (!got) {
      add("DRIFT", `field ${want.name}`, "missing", () => gql(`mutation($input: CreateProjectV2FieldInput!) { createProjectV2Field(input: $input) { projectV2Field { ... on ProjectV2SingleSelectField { id } ... on ProjectV2Field { id } } } }`, {
        input: { projectId: project, dataType: want.type, name: want.name, ...(want.type === "SINGLE_SELECT" ? { singleSelectOptions: want.options.map((name) => ({ name, color: "GRAY", description: "" })) } : {}) },
      }));
      continue;
    }
    const missing = (want.options ?? []).filter((o) => !got.options?.some((x) => same(x.name, o)));
    if (missing.length === 0) add("OK", `field ${want.name}`);
    else add("DRIFT", `field ${want.name}`, `lacks options: ${missing.join(", ")}`, () => gql(`mutation($input: UpdateProjectV2FieldInput!) { updateProjectV2Field(input: $input) { projectV2Field { ... on ProjectV2SingleSelectField { id } } } }`, {
      input: { fieldId: got.id, name: got.name, singleSelectOptions: [...got.options.map((o) => ({ id: o.id, name: o.name, color: o.color, description: o.description ?? "" })), ...missing.map((name) => ({ name, color: "GRAY", description: "" }))] },
    }));
  }

  // Issue fields: present on the Project by name; added from the org's list.
  for (const name of config.issueFields) {
    if (byName(name)) { add("OK", `issue field ${name}`); continue; }
    const org = orgIssueFields.find((f) => same(f.name, name));
    if (!org) add("DRIFT", `issue field ${name}`, "does not exist in the organization");
    else add("DRIFT", `issue field ${name}`, "not on the Project", () => gql(`mutation($input: CreateProjectV2IssueFieldInput!) { createProjectV2IssueField(input: $input) { clientMutationId } }`, { input: { projectId: project, issueFieldId: org.node_id } }));
  }

  // Views, by name or by renamedFrom.
  for (const want of config.views) {
    const label = `view ${want.name}`;
    const views = live.views.nodes;
    const got = views.find((v) => v.name === want.name) ?? (want.renamedFrom ? views.find((v) => v.name === want.renamedFrom) : undefined);
    const update = (id) => gql(`mutation($input: UpdateProjectV2ViewInput!) { updateProjectV2View(input: $input) { projectV2View { id } } }`, { input: { viewId: id, name: want.name, layout: want.layout, filter: want.filter } });
    if (!got) {
      add("DRIFT", label, "missing", () => {
        const made = gql(`mutation($input: CreateProjectV2ViewInput!) { createProjectV2View(input: $input) { projectV2View { id } } }`, { input: { projectId: project, name: want.name, layout: want.layout } });
        update(made.createProjectV2View.projectV2View.id);
      });
    } else if (got.name !== want.name || got.layout !== want.layout || (got.filter ?? "") !== want.filter) {
      add("DRIFT", label, `is "${got.name}", ${got.layout}, filter "${got.filter ?? ""}"`, () => update(got.id));
    } else {
      add("OK", label);
    }
    add("SKIP", `${label}: set in the UI`, want.ui);
  }
  for (const w of config.workflows) add("SKIP", "workflow: set in the UI", w);

  return { lines, todo };
}

function print(lines) {
  for (const { state, label, extra } of lines) console.log(`${state.padEnd(5)} ${label}${extra ? `: ${extra}` : ""}`);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const owner = process.env.OWNER;
  const number = process.env.PROJECT;
  if (!owner) throw new Usage("OWNER is not set");
  if (!/^[0-9]+$/.test(number ?? "")) throw new Usage("PROJECT must be a number");

  const config = JSON.parse(readFileSync(CONFIG, "utf8"));
  const projects = JSON.parse(readFileSync(PROJECTS, "utf8"));
  const live = gql(LIVE, { owner, number: Number(number) }).organization?.projectV2;
  if (!live) throw new Error("the Project was not found or is not readable");
  const orgFields = JSON.parse(gh(["api", `orgs/${owner}/issue-fields`]));

  const { lines, todo } = plan(config, projects, live, orgFields);
  print(lines);
  const drift = lines.filter((l) => l.state === "DRIFT").length;

  if (!opts.apply) {
    console.log(`${drift} drifted item(s)`);
    process.exit(drift > 0 ? 1 : 0);
  }
  if (todo.length === 0) { console.log("nothing to apply"); return; }
  if (!opts.yes) {
    if (!process.stdin.isTTY) throw new Usage("--apply needs --yes when there is no terminal");
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(`Apply ${todo.length} change(s) to ${owner}'s Project ${number}? [y/N] `);
    rl.close();
    if (!/^y(es)?$/i.test(answer.trim())) { console.log("nothing applied"); return; }
  }
  for (const { label, fix } of todo) {
    fix();
    console.log(`APPLIED ${label}`);
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    if (err instanceof Usage) { console.error(`${err.message}\nusage: project-config.mjs [--check | --apply [--yes]]`); process.exit(2); }
    console.error(err.message);
    process.exit(3);
  });
}
