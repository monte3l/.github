// SPDX-FileCopyrightText: Copyright (c) 2026 Enrico Lionello (enri3l) and Giulia Montevecchi (giulmonte), monte3l
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
// A description as HTML: a `backtick span` in it is code, as it is in the Markdown copy, instead of
// showing its backticks.
const rich = (text) =>
  String(text)
    .split(/(`[^`]+`)/)
    .map((part) => (/^`[^`]+`$/.test(part) ? code(part.slice(1, -1)) : esc(part)))
    .join("");
// A table cell in Markdown: a pipe would end the cell, and a newline the row.
const cell = (text) => String(text).replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ");
const mdCode = (text) => `\`${text}\``;

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
  let markdownRows = "";
  for (const name of names) {
    const props = JSON.parse(await readFile(path.join(dir, `${name}.properties.json`), "utf8"));
    const yaml = await readFile(path.join(dir, `${name}.yml`), "utf8");
    const triggers = blockKeys(yaml, "on");
    const jobs = blockKeys(yaml, "jobs");
    rows += `<tr><td>${code(`${name}.yml`)}</td><td>${esc(props.name)}</td><td>${rich(props.description)}</td><td>${triggers.map(code).join(" ")}</td><td>${jobs.map(code).join(" ")}</td></tr>\n`;
    markdownRows += `| ${mdCode(`${name}.yml`)} | ${cell(props.name)} | ${cell(props.description)} | ${triggers.map(mdCode).join(" ")} | ${jobs.map(mdCode).join(" ")} |\n`;
  }
  const html = `<h1 id="workflow-templates">Workflow templates</h1>
<p class="body">Copy a template into <code class="code m3l-code-inline">.github/workflows/</code> from <strong>Actions, New workflow</strong> in any monte3l repository. GitHub substitutes the default branch at copy time, and a copy is never updated by a later change here.</p>
<table>
<thead><tr><th>File</th><th>Name</th><th>What it does</th><th>Triggers</th><th>Jobs</th></tr></thead>
<tbody>
${rows}</tbody>
</table>
`;
  const markdown = `# Workflow templates

Copy a template into ${mdCode(".github/workflows/")} from **Actions, New workflow** in any monte3l repository. GitHub substitutes the default branch at copy time, and a copy is never updated by a later change here.

| File | Name | What it does | Triggers | Jobs |
| --- | --- | --- | --- | --- |
${markdownRows}`;
  return [
    {
      out: "templates.html",
      group: "Standard",
      label: "Workflow templates",
      summary: "Every workflow template, with what it does, its triggers and its jobs",
      html,
      markdown,
    },
  ];
}
