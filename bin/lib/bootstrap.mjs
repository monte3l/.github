// SPDX-FileCopyrightText: Copyright (c) 2026 Enrico Lionello (enri3l) and Giulia Montevecchi (giulmonte), monte3l
// SPDX-License-Identifier: MIT

/**
 * What a new repository starts with, as text. Pure: `bin/bootstrap-render.mjs`
 * reads the files and passes them in, and writes what this returns. The list of
 * entries is `blueprint/bootstrap.json`, checked by `bin/bootstrap-parity.mjs`.
 *
 * Workflow templates are rendered exactly as the template sync renders them, so
 * a new repository's copies classify as identical and the sync keeps them
 * current. A starter has its placeholder words replaced by the repository name
 * and its literal `replace` texts by their values. Any placeholder that is left
 * is reported, never guessed: a person fills it in.
 */
import { render } from "./template-sync.mjs";

const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** The placeholders that may still be in a written file, one pattern per kind. */
const LEFTOVER = [/REPLACE-WITH-[A-Z0-9-]+/g, /\bPROJECT\b/g, /\bREPOSITORY\b/g];
const BRACE_LEFTOVER = /\{[^{}\n]{2,}\}/g;

/** @param {string} text @param {string} word @param {string} value */
const replaceAll = (text, word, value) => text.split(word).join(value);

/**
 * @param {{
 *   name: string,
 *   kind?: string,
 *   claude?: boolean,
 *   scaffold?: boolean,
 *   bootstrap: any, projects: any[], designSystem: { version: string }, sync: { templates: Record<string,string> },
 *   read: (path: string) => string,
 * }} input
 * @returns {{
 *   files: Array<{ to: string, from: string | null, text: string }>,
 *   left: string[],
 *   unfilled: Array<{ to: string, found: string[] }>,
 *   project: { site: string, description: string, topics: string[] },
 *   syncEntry: string,
 * }}
 * @throws {Error} on a bad name, an unknown kind, or a project that is not in projects.json
 */
export function renderBootstrap({ name, kind, claude = false, scaffold = false, bootstrap, projects, designSystem, sync, read }) {
  if (!NAME_RE.test(name)) throw new Error(`"${name}" is not a repository name`);
  const project = projects.find((entry) => entry.repo === name);
  if (!project) throw new Error(`${name} is not in blueprint/projects.json: add it, and its row in profile/README.md, first`);
  if (kind !== undefined && !bootstrap.kinds.includes(kind)) throw new Error(`"${kind}" is not a kind (use ${bootstrap.kinds.join(", ")})`);

  const active = new Set([...(kind === undefined ? [] : ["kind"]), ...(claude ? ["claude"] : [])]);
  const wanted = (entry) => entry.requires === undefined || active.has(entry.requires);
  const files = [];
  const left = [];

  for (const starter of bootstrap.starters.filter(wanted)) {
    const from = starter.perKind ? starter.from.replaceAll("KIND", kind) : starter.from;
    let text = read(from);
    for (const [literal, value] of Object.entries(starter.replace ?? {})) text = replaceAll(text, literal, value);
    for (const word of starter.substitute ?? []) text = replaceAll(text, word, name);
    files.push({ to: starter.to, from, text, starter: true });
  }

  for (const template of bootstrap.templates.filter(wanted)) {
    if (template.unlessScaffold && scaffold) {
      left.push(`.github/workflows/${template.name}.yml: the scaffold's own ci.yml already defines this check`);
      continue;
    }
    const text = render(read(`workflow-templates/${template.name}.yml`), { site: project.site, flags: [], defaultBranch: "main" });
    files.push({ to: `.github/workflows/${template.name}.yml`, from: `workflow-templates/${template.name}.yml`, text: text.endsWith("\n") ? text : `${text}\n` });
  }

  for (const entry of bootstrap.generated) {
    if (entry.to !== "design/README.md") throw new Error(`blueprint/bootstrap.json generates ${entry.to}, which bin/lib/bootstrap.mjs does not know how to write`);
    const marker = [
      "# design/ -- m3l-design, adopted",
      "",
      "This repository follows **m3l-design**, the shared design system for",
      "everything published under the `monte3l` GitHub org.",
      "",
      "- **Source:** [github.com/monte3l/m3l-design](https://github.com/monte3l/m3l-design)",
      `- **Version adopted:** \`${designSystem.version}\``,
      "- **Tier:** content",
      "",
    ].join("\n");
    files.push({ to: entry.to, from: null, text: marker });
  }

  const unfilled = [];
  for (const file of files.filter((entry) => entry.starter)) {
    const patterns = file.to.endsWith(".md") ? [...LEFTOVER, BRACE_LEFTOVER] : LEFTOVER;
    const found = [...new Set(patterns.flatMap((pattern) => file.text.match(pattern) ?? []))];
    if (found.length > 0) unfilled.push({ to: file.to, found: found.slice(0, 4) });
  }
  // release-please reads the version of each package from the manifest, by the package's path in
  // the config: a key that does not match is a release that never finds its version.
  const config = files.find((file) => file.to === "release-please-config.json");
  const manifest = files.find((file) => file.to === ".release-please-manifest.json");
  if (config && manifest) {
    try {
      const wantedKeys = Object.keys(JSON.parse(config.text).packages ?? {}).sort();
      const haveKeys = Object.keys(JSON.parse(manifest.text)).sort();
      if (wantedKeys.join("\n") !== haveKeys.join("\n")) {
        unfilled.push({ to: manifest.to, found: [`its keys (${haveKeys.join(", ")}) must be the package paths in release-please-config.json (${wantedKeys.join(", ")})`] });
      }
    } catch {
      unfilled.push({ to: manifest.to, found: ["release-please-config.json or the manifest is not valid JSON"] });
    }
  }
  for (const file of files) delete file.starter;

  files.sort((a, b) => a.to.localeCompare(b.to));
  return {
    files,
    left,
    unfilled,
    project: { site: project.site, description: project.description, topics: project.topics },
    syncEntry: `"${name}": { "flags": [] }`,
  };
}
