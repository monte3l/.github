// SPDX-FileCopyrightText: Copyright (c) 2026 Enrico Lionello
// SPDX-License-Identifier: MIT

/**
 * Docs-kit generator: the workflow-template catalog, read from
 * `workflow-templates/*.properties.json` and the workflows beside them, so the
 * page can only list templates that exist.
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const esc = (text) => String(text).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const code = (text) => `<code class="code m3l-code-inline">${esc(text)}</code>`;

/**
 * Keys at 2-space indent directly under a top-level `key:` block.
 *
 * @param {string} yaml
 * @param {string} key
 * @returns {string[]}
 */
export function blockKeys(yaml, key) {
  const lines = yaml.split("\n");
  const start = lines.findIndex((line) => line === `${key}:`);
  if (start === -1) return [];
  const out = [];
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line)) break;
    const match = /^ {2}([A-Za-z0-9_$-]+):/.exec(line);
    if (match) out.push(match[1]);
  }
  return out;
}

export default async function generate({ root }) {
  const dir = path.join(root, "workflow-templates");
  const names = (await readdir(dir)).filter((n) => n.endsWith(".properties.json")).map((n) => n.replace(".properties.json", "")).sort();
  let rows = "";
  for (const name of names) {
    const props = JSON.parse(await readFile(path.join(dir, `${name}.properties.json`), "utf8"));
    const yaml = await readFile(path.join(dir, `${name}.yml`), "utf8");
    const triggers = blockKeys(yaml, "on");
    const jobs = blockKeys(yaml, "jobs");
    rows += `<tr><td>${code(`${name}.yml`)}</td><td>${esc(props.name)}</td><td>${esc(props.description)}</td><td>${triggers.map(code).join(" ")}</td><td>${jobs.map(code).join(" ")}</td></tr>\n`;
  }
  const html = `<h1 id="workflow-templates">Workflow templates</h1>
<p class="body">Copy a template into <code class="code m3l-code-inline">.github/workflows/</code> from <strong>Actions, New workflow</strong> in any monte3l repository. GitHub substitutes the default branch at copy time, and a copy is never updated by a later change here.</p>
<table>
<thead><tr><th>File</th><th>Name</th><th>What it does</th><th>Triggers</th><th>Jobs</th></tr></thead>
<tbody>
${rows}</tbody>
</table>
`;
  return [{ out: "templates.html", group: "Standard", label: "Workflow templates", html }];
}
