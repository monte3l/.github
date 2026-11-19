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
 *   private?: boolean,
 *   docs?: boolean,
 *   today?: string,
 *   scaffold?: boolean,
 *   bootstrap: any, projects: any[], designSystem: { version: string }, sync: { templates: Record<string,string> },
 *   read: (path: string) => string,
 * }} input
 * @returns {{
 *   files: Array<{ to: string, from: string | null, text: string }>,
 *   left: string[],
 *   unfilled: Array<{ to: string, found: string[] }>,
 *   todo: string[],
 *   orgSecrets: string[],
 *   project: { site: string, description: string, topics: string[] },
 *   syncEntry: string,
 * }}
 * @throws {Error} on a bad name, an unknown kind, or a project that is not in projects.json
 */
export function renderBootstrap({ name, kind, claude = false, private: isPrivate = false, docs = false, today = new Date().toISOString().slice(0, 10), scaffold = false, bootstrap, projects, designSystem, sync, read }) {
  if (!NAME_RE.test(name)) throw new Error(`"${name}" is not a repository name`);
  const project = projects.find((entry) => entry.repo === name);
  if (!project) throw new Error(`${name} is not in blueprint/projects.json: add it, and its row in profile/README.md, first`);
  if (kind !== undefined && !bootstrap.kinds.includes(kind)) throw new Error(`"${kind}" is not a kind (use ${bootstrap.kinds.join(", ")})`);

  if (docs && scaffold) throw new Error("--docs and --scaffold cannot be combined yet: the scaffold has its own docs setup");
  const active = new Set([...(kind === undefined ? [] : ["kind"]), ...(isPrivate ? [] : ["public"]), ...(claude ? ["claude"] : []), ...(docs ? ["docs"] : [])]);
  // `requires` is a condition, or `!condition` for the opposite.
  const wanted = (entry) => entry.requires === undefined || (entry.requires.startsWith("!") ? !active.has(entry.requires.slice(1)) : active.has(entry.requires));
  const host = new URL(project.site).host;
  const tokens = { repo: name, site: project.site, host, subdomain: host.split(".")[0] };
  const expand = (text) => text.replace(/\{([a-z][a-z-]*)\}/g, (whole, token) => (Object.hasOwn(tokens, token) ? tokens[token] : whole));
  const files = [];
  const left = [];
  const todo = [];

  for (const starter of bootstrap.starters.filter(wanted)) {
    const from = starter.perKind ? starter.from.replaceAll("KIND", kind) : starter.from;
    let text = read(from);
    for (const [literal, value] of Object.entries(starter.replace ?? {})) text = replaceAll(text, literal, expand(value));
    for (const word of starter.substitute ?? []) text = replaceAll(text, word, name);
    files.push({ to: starter.to, from, text, starter: true });
    if (starter.todo) todo.push(`${starter.to}: ${starter.todo}`);
  }

  for (const template of bootstrap.templates.filter(wanted)) {
    if (template.unlessScaffold && scaffold) {
      left.push(`.github/workflows/${template.name}.yml: the scaffold's own ci.yml already defines this check`);
      continue;
    }
    const text = render(read(`workflow-templates/${template.name}.yml`), { site: project.site, flags: [], defaultBranch: "main" });
    files.push({ to: `.github/workflows/${template.name}.yml`, from: `workflow-templates/${template.name}.yml`, text: text.endsWith("\n") ? text : `${text}\n` });
    if (template.todo) todo.push(`.github/workflows/${template.name}.yml: ${template.todo}`);
  }

  for (const entry of bootstrap.generated) {
    if (entry.to !== "design/README.md") throw new Error(`blueprint/bootstrap.json generates ${entry.to}, which bin/lib/bootstrap.mjs does not know how to write`);
    // A docs site carries a copy of the design, so its marker is the vendored tier. bin/sync-design.sh
    // rewrites only the version and date lines of it, so the rest is written here.
    const marker = (docs
      ? [
          "# design/ -- m3l-design, vendored",
          "",
          "This repository follows **m3l-design**, the shared design system for",
          "everything published under the `monte3l` GitHub org.",
          "",
          "- **Source:** [github.com/monte3l/m3l-design](https://github.com/monte3l/m3l-design)",
          `- **Version copied:** \`${designSystem.version}\``,
          `- **Last re-synced:** ${today}`,
          "- **Tier:** vendored",
          "",
          '## What "vendored tier" means here',
          "",
          "This repository publishes a docs site, so it carries a copy of the system:",
          "`source/`, `tokens.css` and `SHA256SUMS`, replaced wholesale by",
          "`bin/sync-design.sh` from an m3l-design checkout. The docs kit in",
          "`source/docs-kit/` builds the site, and its `--check` verifies the copy",
          "against `SHA256SUMS`. Never edit them by hand: local divergence belongs in",
          "`design/local/`, which a re-sync never touches.",
          "",
        ]
      : [
          "# design/ -- m3l-design, adopted",
          "",
          "This repository follows **m3l-design**, the shared design system for",
          "everything published under the `monte3l` GitHub org.",
          "",
          "- **Source:** [github.com/monte3l/m3l-design](https://github.com/monte3l/m3l-design)",
          `- **Version adopted:** \`${designSystem.version}\``,
          "- **Tier:** content",
          "",
        ]
    ).join("\n");
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

  for (const entry of (bootstrap.todos ?? []).filter(wanted)) todo.push(expand(entry.text));
  const orgSecrets = (bootstrap.orgSecrets ?? []).map((secret) => (typeof secret === "string" ? { name: secret } : secret)).filter(wanted).map((secret) => secret.name);

  files.sort((a, b) => a.to.localeCompare(b.to));
  return {
    files,
    left,
    unfilled,
    todo,
    orgSecrets,
    project: { site: project.site, description: project.description, topics: project.topics },
    syncEntry: `"${name}": { "flags": [] }`,
  };
}
