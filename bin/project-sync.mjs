#!/usr/bin/env node
// SPDX-FileCopyrightText: Copyright (c) 2026 Enrico Lionello (enri3l) and Giulia Montevecchi (giulmonte), monte3l
// SPDX-License-Identifier: MIT

// Keeps the org Project in step with the organization. It adds and updates, and
// never removes or archives an item.
//
//   project-sync.mjs [--dry-run]
//
// What it does, on every run:
//   1. Adds every open issue and open pull request (any author) of the
//      organization's non-archived repositories that is not on the Project.
//   2. Mirrors each open discussion in the `Ideas` category of the discussions
//      repository as a draft item (Kind = Idea discussion, Source = its URL),
//      and sets a mirrored idea to Done once its discussion is no longer open.
//   3. Mirrors each stable release (not a draft, not a pre-release) published in
//      the last 30 days as a draft item (Kind = Release, Status = Done).
//   4. Gives an item with no Status one: Backlog if it is open, Done if not.
//
// A Project holds only issues, pull requests and draft issues, so discussions and
// releases can only appear as drafts. The 30 days match the Project's auto-archive.
//
// Environment:
//   GH_TOKEN   the monte3l-planning App token: Projects write; Issues, Pull
//              requests, Discussions, Contents and Metadata read
//   OWNER      the organization
//   PROJECT    the Project's number
//   DISCUSSIONS_REPO   repository that holds the Ideas category (default .github)
//   NOW        an ISO timestamp that replaces the clock (tests)
//
// The repository is public, so the output is counts only: never a repository
// name, a title or a URL. With --dry-run nothing is written.
//
// Exit codes: 0 done, 2 usage or a missing tool, 3 any failed call.

import { execFileSync } from "node:child_process";

const WINDOW_DAYS = 30;

class Usage extends Error {}

function gh(args, input) {
  // stderr is piped and never printed: gh's error text names the request URL, and so the repository.
  return execFileSync("gh", args, { encoding: "utf8", input, stdio: ["pipe", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 });
}

function gql(query, variables = {}) {
  const res = JSON.parse(gh(["api", "graphql", "--input", "-"], JSON.stringify({ query, variables })));
  if (res.errors?.length) throw new Error(`GraphQL: ${res.errors.map((e) => e.message).join("; ")}`);
  return res.data;
}

// REST list, every page, one JSON object per line. A failed call throws, so a
// failed listing is never read as "nothing to do".
function restList(endpoint) {
  const out = gh(["api", "--paginate", endpoint, "--jq", ".[] | @json"]);
  return out.split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

const PROJECT_Q = `query($owner: String!, $number: Int!) {
  organization(login: $owner) { projectV2(number: $number) {
    id
    fields(first: 50) { nodes {
      ... on ProjectV2FieldCommon { id name }
      ... on ProjectV2SingleSelectField { options { id name } }
    } }
  } }
}`;

const ITEMS_Q = `query($owner: String!, $number: Int!, $after: String) {
  organization(login: $owner) { projectV2(number: $number) {
    items(first: 100, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id type
        content { ... on Issue { id state } ... on PullRequest { id state } }
        source: fieldValueByName(name: "Source") { ... on ProjectV2ItemFieldTextValue { text } }
        status: fieldValueByName(name: "Status") { ... on ProjectV2ItemFieldSingleSelectValue { name } }
        kind: fieldValueByName(name: "Kind") { ... on ProjectV2ItemFieldSingleSelectValue { name } }
      }
    }
  } }
}`;

const IDEAS_Q = `query($owner: String!, $repo: String!, $after: String) {
  repository(owner: $owner, name: $repo) {
    discussions(first: 100, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes { title url closed category { slug } }
    }
  }
}`;

function allItems(owner, number) {
  const items = [];
  let after = null;
  for (;;) {
    const page = gql(ITEMS_Q, { owner, number, after }).organization.projectV2.items;
    items.push(...page.nodes);
    if (!page.pageInfo.hasNextPage) return items;
    after = page.pageInfo.endCursor;
  }
}

function allIdeas(owner, repo) {
  const found = [];
  let after = null;
  for (;;) {
    const page = gql(IDEAS_Q, { owner, repo, after }).repository.discussions;
    found.push(...page.nodes.filter((d) => d.category.slug === "ideas"));
    if (!page.pageInfo.hasNextPage) return found;
    after = page.pageInfo.endCursor;
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== "--dry-run")) throw new Usage("unknown argument");
  const dry = args[0] === "--dry-run";

  const owner = process.env.OWNER;
  const number = process.env.PROJECT;
  if (!owner) throw new Usage("OWNER is not set");
  if (!/^[0-9]+$/.test(number ?? "")) throw new Usage("PROJECT must be a number");
  const discussionsRepo = process.env.DISCUSSIONS_REPO ?? ".github";
  const now = process.env.NOW ? new Date(process.env.NOW) : new Date();
  const since = new Date(now.getTime() - WINDOW_DAYS * 86_400_000);

  const project = gql(PROJECT_Q, { owner, number: Number(number) }).organization?.projectV2;
  if (!project) throw new Error("the Project was not found or is not readable");
  const field = (name) => project.fields.nodes.find((f) => f.name === name);
  const status = field("Status");
  const kind = field("Kind");
  const source = field("Source");
  const option = (f, name) => f?.options?.find((o) => o.name.toLowerCase() === name.toLowerCase())?.id;
  const backlog = option(status, "Backlog");
  const done = option(status, "Done");
  if (!backlog || !done) throw new Error("the Project's Status has no Backlog and Done options: run project-config.mjs");
  if (!kind || !source) throw new Error("the Project has no Kind and Source fields: run project-config.mjs");

  const items = allItems(owner, Number(number));
  const onProject = new Map(); // content node id -> item
  const bySource = new Map(); // Source url -> item
  for (const item of items) {
    if (item.content?.id) onProject.set(item.content.id, item);
    if (item.source?.text) bySource.set(item.source.text, item);
  }

  // Each list is read into a variable first: a failed listing must throw, not read as "nothing".
  const repos = JSON.parse(gh(["repo", "list", owner, "--limit", "200", "--no-archived", "--json", "name"])).map((r) => r.name);
  const ideas = allIdeas(owner, discussionsRepo);

  const count = { issues: 0, prs: 0, ideas: 0, releases: 0, added: 0, updated: 0 };
  const setValue = (itemId, fieldId, value) => {
    if (dry) return;
    gql(`mutation($input: UpdateProjectV2ItemFieldValueInput!) { updateProjectV2ItemFieldValue(input: $input) { projectV2Item { id } } }`, { input: { projectId: project.id, itemId, fieldId, value } });
  };
  const addContent = (nodeId) => {
    if (dry) return "dry";
    return gql(`mutation($input: AddProjectV2ItemByIdInput!) { addProjectV2ItemById(input: $input) { item { id } } }`, { input: { projectId: project.id, contentId: nodeId } }).addProjectV2ItemById.item.id;
  };
  const addDraft = (title, url) => {
    if (dry) return "dry";
    return gql(`mutation($input: AddProjectV2DraftIssueInput!) { addProjectV2DraftIssue(input: $input) { projectItem { id } } }`, { input: { projectId: project.id, title, body: `Mirrored from ${url}` } }).addProjectV2DraftIssue.projectItem.id;
  };

  // 1. Issues and pull requests. The issues endpoint lists both.
  for (const name of repos) {
    for (const issue of restList(`repos/${owner}/${name}/issues?state=open&per_page=100`)) {
      if (issue.pull_request) count.prs++; else count.issues++;
      const existing = onProject.get(issue.node_id);
      if (!existing) {
        const id = addContent(issue.node_id);
        setValue(id, status.id, { singleSelectOptionId: backlog });
        count.added++;
      } else if (!existing.status?.name) {
        setValue(existing.id, status.id, { singleSelectOptionId: backlog });
        count.updated++;
      }
    }
  }

  // Closed or merged items that still have no Status: Done.
  for (const item of items) {
    if (item.content?.state && item.content.state !== "OPEN" && !item.status?.name) {
      setValue(item.id, status.id, { singleSelectOptionId: done });
      count.updated++;
    }
  }

  // 2. Ideas discussions as drafts.
  const openIdeas = new Set();
  for (const d of ideas) {
    if (d.closed) continue;
    openIdeas.add(d.url);
    count.ideas++;
    const existing = bySource.get(d.url);
    if (!existing) {
      const id = addDraft(d.title, d.url);
      setValue(id, kind.id, { singleSelectOptionId: option(kind, "Idea discussion") });
      setValue(id, source.id, { text: d.url });
      setValue(id, status.id, { singleSelectOptionId: backlog });
      count.added++;
    }
  }
  for (const item of items) {
    if (item.kind?.name === "Idea discussion" && item.source?.text && !openIdeas.has(item.source.text) && item.status?.name !== "Done") {
      setValue(item.id, status.id, { singleSelectOptionId: done });
      count.updated++;
    }
  }

  // 3. Stable releases of the last 30 days as drafts, already Done.
  for (const name of repos) {
    for (const rel of restList(`repos/${owner}/${name}/releases?per_page=100`)) {
      if (rel.draft || rel.prerelease || !rel.published_at || new Date(rel.published_at) < since) continue;
      count.releases++;
      if (bySource.has(rel.html_url)) continue;
      const id = addDraft(`${name} ${rel.tag_name}`, rel.html_url);
      setValue(id, kind.id, { singleSelectOptionId: option(kind, "Release") });
      setValue(id, source.id, { text: rel.html_url });
      setValue(id, status.id, { singleSelectOptionId: done });
      count.added++;
    }
  }

  const verb = dry ? "would be added" : "added";
  const upd = dry ? "would be updated" : "updated";
  console.log(`${count.issues} open issues, ${count.prs} open pull requests, ${count.ideas} open ideas, ${count.releases} recent releases in ${repos.length} repositories: ${count.added} ${verb}, ${count.updated} ${upd}`);
}

main().catch((err) => {
  if (err instanceof Usage) { console.error(`${err.message}\nusage: project-sync.mjs [--dry-run]`); process.exit(2); }
  if (err?.code === "ENOENT") { console.error("missing tool: gh"); process.exit(2); }
  console.error("project-sync failed");
  process.exit(3);
});
