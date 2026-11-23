// SPDX-FileCopyrightText: Copyright (c) 2026 Enrico Lionello (enri3l) and Giulia Montevecchi (giulmonte), monte3l
// SPDX-License-Identifier: MIT

// Three small rules that live in files and have no script of their own: the optional `assets` job of
// workflow-templates/release.yml, `exclude-paths` in the release-please starters, and the globs and
// `merge=union` that keep two pull requests from editing the same line.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { render } from "../bin/lib/template-sync.mjs";

const root = path.join(import.meta.dirname, "..");
const read = (rel) => readFileSync(path.join(root, rel), "utf8");
const release = read("workflow-templates/release.yml");

/** The lines of the `finalize` job's `needs` list. */
function finalizeNeeds(text) {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => line === "  finalize:");
  assert.ok(start >= 0, "no finalize job");
  const needs = lines.findIndex((line, i) => i > start && line.startsWith("    needs:"));
  const items = [];
  for (let i = needs + 1; i < lines.length && /^\s{6}- /.test(lines[i]); i += 1) items.push(lines[i].replace(/^\s*- /, ""));
  return items;
}

test("the assets flag is declared, and the job is in the template", () => {
  assert.ok("assets" in JSON.parse(read("blueprint/sync.json")).flags);
  assert.match(release, /^ {2}assets:$/m);
});

test("without the flag the rendered release.yml has no assets job and finalize waits for prepare only", () => {
  const out = render(release, { flags: [] });
  assert.doesNotMatch(out, /^ {2}assets:$/m);
  assert.doesNotMatch(out, /release-assets/);
  assert.deepEqual(finalizeNeeds(out), ["prepare"]);
});

test("with the flag the job is there and finalize waits for it", () => {
  const out = render(release, { flags: ["assets"] });
  assert.match(out, /^ {2}assets:$/m);
  assert.deepEqual(finalizeNeeds(out), ["prepare", "assets"]);
});

test("the assets job writes no per-repository or per-version path and takes no OIDC or attestation rights", () => {
  const out = render(release, { flags: ["assets"] });
  const job = out.slice(out.indexOf("\n  assets:"), out.indexOf("\n  finalize:"));
  // actions/attest takes one literal file for sbom-path and no glob; the attestation is finalize's, by glob.
  assert.doesNotMatch(job, /sbom-path/);
  assert.doesNotMatch(job, /id-token|attestations/);
  assert.match(job, /contents: write/);
  assert.match(job, /persist-credentials: false/);
  // The name comes from the event, not from a hard-coded repository.
  assert.doesNotMatch(job, /m3l-/);
  assert.match(job, /github\.event\.repository\.name/);
});

test("a copy made through New workflow keeps the markers as comments, and its assets job cannot start by default", () => {
  // No render: GitHub copies the file as it is.
  const job = release.slice(release.indexOf("\n  assets:"), release.indexOf("\n  finalize:"));
  const condition = /^ {4}if: (.*)$/m.exec(job)?.[1] ?? "";
  assert.match(condition, /vars\.RELEASE_ASSETS == 'true'/, "the job must test an opt-in variable");
  assert.match(condition, /releases_created == 'true'/);
  // A skipped assets job must not skip the publish: the implicit success() would.
  const finalize = release.slice(release.indexOf("\n  finalize:"));
  assert.match(/^ {4}if: (.*)$/m.exec(finalize)?.[1] ?? "", /!failure\(\) && !cancelled\(\)/);
});

test("the tag check reads the tag through the API with the token, not an anonymous ls-remote", () => {
  assert.doesNotMatch(release, /ls-remote/);
  const job = release.slice(release.indexOf("\n  assets:"), release.indexOf("\n  finalize:"));
  assert.match(job, /GH_TOKEN: \$\{\{ github\.token \}\}/);
  assert.match(job, /git\/ref\/tags\//);
});

test("the shared finalize workflow still attests every asset by glob, which is what the assets job relies on", () => {
  assert.match(read(".github/workflows/release-finalize.yml"), /subject-path: assets\/\*/);
});

test("the release-please starters for a root package exclude the paths that are not the payload", () => {
  for (const kind of ["simple", "plugin"]) {
    const config = JSON.parse(read(`blueprint/files/release-please/${kind}.json`));
    const excluded = config.packages["."]["exclude-paths"];
    assert.deepEqual(excluded, [".claude", ".github", "LICENSES", "docs"], kind);
  }
});

test("the library starter has no repository-level exclude-paths: its packages live under packages/", () => {
  const config = JSON.parse(read("blueprint/files/release-please/library.json"));
  for (const pkg of Object.values(config.packages)) assert.equal(pkg["exclude-paths"], undefined);
});

test("verify.yml checks scripts by glob, not by a list of file names", () => {
  const verify = read(".github/workflows/verify.yml");
  const step = verify.slice(verify.indexOf("- name: Script syntax and shellcheck"), verify.indexOf("# The parity gates"));
  assert.match(step, /bin\/\*\*\/\*\.sh/);
  assert.match(step, /tests\/\*\.sh/);
  assert.match(step, /bin\/\*\*\/\*\.mjs/);
  assert.doesNotMatch(step, /bin\/[a-z-]+\.sh/, "a script named in the step is a line two pull requests both edit");
  // `bash -n` reads one script and takes the rest as arguments: a list on one line checked only the first.
  assert.doesNotMatch(step, /bash -n .*\.sh .*\.sh/);
});

test("the knowledge log merges by union, and the starter explains when to use it", () => {
  assert.match(read(".gitattributes"), /^knowledge\/log\.md merge=union$/m);
  assert.match(read("blueprint/files/gitattributes"), /merge=union/);
  // The starter only carries the example as a comment: a rule for a path other repositories lack would be noise.
  assert.doesNotMatch(read("blueprint/files/gitattributes"), /^[^#\n].*merge=union/m);
});
