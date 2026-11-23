// SPDX-FileCopyrightText: Copyright (c) 2026 Enrico Lionello (enri3l) and Giulia Montevecchi (giulmonte), monte3l
// SPDX-License-Identifier: MIT

// What a new repository starts with, rendered as text.
// Run with: node --test "tests/*.test.mjs"
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderBootstrap } from "../bin/lib/bootstrap.mjs";
import { roadmapProblems } from "../bin/lib/roadmap.mjs";
import { classify, render } from "../bin/lib/template-sync.mjs";
const root = path.resolve(import.meta.dirname, "..");
const json = (rel) => JSON.parse(readFileSync(path.join(root, rel), "utf8"));
const base = { bootstrap: json("blueprint/bootstrap.json"), projects: json("blueprint/projects.json"), designSystem: json("blueprint/design-system.json"), sync: json("blueprint/sync.json"), read: (rel) => readFileSync(path.join(root, rel), "utf8") };
const go = (extra) => renderBootstrap({ name: "m3l-plugins", ...base, ...extra });

// every rendered workflow is identical to its template as the sync renders it
const out = go({ kind: "plugin", claude: true });
const project = base.projects.find((p) => p.repo === "m3l-plugins");
for (const file of out.files.filter((f) => f.to.startsWith(".github/workflows/"))) {
  const name = path.basename(file.to, ".yml");
  const rendered = render(base.read(`workflow-templates/${name}.yml`), { site: project.site, flags: [], defaultBranch: "main" });
  assert.equal(classify(file.text, rendered, []).state, "IDENTICAL", `${name} must classify IDENTICAL`);
  assert.ok(!file.text.includes("$default-branch"), `${name}: no $default-branch left`);
  assert.doesNotMatch(file.text, /PROJECT\.monte3l\.com/, `${name}: no PROJECT url left`);
}
// every `managed` template that is not conditional is written, so nothing the sync manages is missing
const written = new Set(out.files.map((f) => f.to));
for (const [name, mode] of Object.entries(base.sync.templates)) {
  const entry = base.bootstrap.templates.find((t) => t.name === name);
  if (entry && !entry.requires) assert.ok(written.has(`.github/workflows/${name}.yml`), `${name} written`);
}
// kind selects the release starter; no kind writes none
assert.ok(go({ kind: "library" }).files.find((f) => f.to === "release-please-config.json").text.includes('"node-workspace"'));
assert.ok(go({ kind: "plugin" }).files.find((f) => f.to === "release-please-config.json").text.includes('"tag-separator": "--"'));
assert.ok(!go({}).files.some((f) => f.to === "release-please-config.json" || f.to === ".github/workflows/release.yml"));
// the release placeholders that can be known are filled; the ones that cannot are reported
const rp = out.files.find((f) => f.to === "release-please-config.json").text;
assert.ok(!rp.includes("bootstrap-sha"));
assert.equal(JSON.parse(rp).signoff.startsWith("monte3l-release[bot]"), true);
assert.equal(JSON.parse(out.files.find((f) => f.to === ".release-please-manifest.json").text)["."], "0.0.0");
assert.ok(out.unfilled.some((u) => u.to === "release-please-config.json" && u.found.includes("REPLACE-WITH-PLUGIN-NAME")));
for (const f of out.files.filter((f) => f.to.endsWith(".json"))) JSON.parse(f.text);
// the name replaces its placeholder words, and nothing of ours is left unreported
assert.ok(out.files.find((f) => f.to === "REUSE.toml").text.includes('SPDX-PackageName = "m3l-plugins"'));
assert.match(out.files.find((f) => f.to === "SECURITY.md").text, /https:\/\/github\.com\/monte3l\/m3l-plugins\/security\/advisories\/new/);
assert.ok(!out.files.find((f) => f.to === "SECURITY.md").text.includes("{repo}"));
// design marker
const marker = out.files.find((f) => f.to === "design/README.md").text;
assert.match(marker, /^- \*\*Version adopted:\*\* `v\d+\.\d+\.\d+`$/m);
assert.match(marker, /^- \*\*Tier:\*\* content$/m);
// claude is conditional; the scaffold drops verify and says why
assert.ok(!go({}).files.some((f) => f.to === ".github/workflows/claude.yml"));
const scaf = go({ kind: "simple", scaffold: true });
assert.ok(!scaf.files.some((f) => f.to === ".github/workflows/verify.yml"));
assert.ok(scaf.left.some((l) => l.includes("verify.yml")));
// refusals
assert.throws(() => go({ kind: "bogus" }), /is not a kind/);
assert.throws(() => go({ name: "not-a-project" }), /not in blueprint\/projects.json/);
assert.throws(() => go({ name: "../x" }), /is not a repository name/);
assert.throws(() => go({ name: "-x" }), /is not a repository name/);
assert.throws(() => go({ name: "" }), /is not a repository name/);
// the manifest keys must match the package paths: library needs a person to set both
const lib = go({ kind: "library" });
assert.ok(lib.unfilled.some((u) => u.to === ".release-please-manifest.json" && u.found[0].includes("must be the package paths")), "library manifest key is reported");
assert.ok(!go({ kind: "simple" }).unfilled.some((u) => u.to === ".release-please-manifest.json"), "simple manifest matches");
assert.ok(!go({ kind: "plugin" }).unfilled.some((u) => u.to === ".release-please-manifest.json"), "plugin manifest matches");
// public / private
const priv = go({ kind: "simple", private: true });
assert.ok(!priv.files.some((f) => f.to === ".github/workflows/scorecard.yml" || f.to === ".github/workflows/dependency-review.yml"), "private drops scorecard and dependency-review");
assert.ok(priv.files.some((f) => f.to === ".github/dependency-review-config.yml"), "the config file is still written (the baseline requires it)");
assert.ok(go({ kind: "simple" }).files.some((f) => f.to === ".github/workflows/scorecard.yml"), "public keeps scorecard");
// todo
assert.ok(go({ kind: "simple" }).todo.some((t) => t.startsWith(".github/workflows/verify.yml: replace the placeholder step")));
// The scaffold defines verify, so there is no todo for it. It ships no ROADMAP and none of the guards, so
// seven todos are left: write the sections, and wire the six guard hooks into settings.json.
const scaffolded = go({ kind: "simple", scaffold: true }).todo;
assert.equal(scaffolded.length, 7, `only the roadmap and the six guard todos are left, got ${JSON.stringify(scaffolded)}`);
assert.ok(scaffolded.some((t) => t.startsWith("ROADMAP.md:")), "one is the roadmap");
assert.ok(scaffolded.some((t) => t.startsWith(".claude/hooks/guard-shared-checkout.mjs: wire")), "one is wiring the worktree guard");
assert.ok(scaffolded.some((t) => t.startsWith(".claude/hooks/require-signoff.sh: wire")), "one is wiring the sign-off guard");
for (const hook of ["guard-secret-writes", "guard-double-background", "guard-git-push-signed", "guard-shell-portability"]) {
  assert.ok(scaffolded.some((t) => t.startsWith(`.claude/hooks/${hook}.mjs: wire`)), `one is wiring ${hook}`);
}
// docs option
const docs = go({ kind: "simple", docs: true, today: "2026-12-24" });
const text = (rendered, to) => rendered.files.find((f) => f.to === to)?.text;
for (const to of ["docs.config.mjs", "tools/deploy/package.json", "tools/deploy/wrangler.jsonc", ".node-version", ".github/environments.json", "LICENSES/OFL-1.1.txt", "LICENSES/LicenseRef-MONTE3L-Brand.txt", ".github/workflows/docs.yml", ".github/workflows/docs-live.yml", ".github/workflows/environments.yml"]) {
  assert.ok(text(docs, to) !== undefined, `docs writes ${to}`);
  assert.ok(text(go({ kind: "simple" }), to) === undefined, `no docs: ${to} is not written`);
}
// tokens: the subdomain is the first label of the site host, the repo is the name
assert.ok(text(docs, "tools/deploy/wrangler.jsonc").includes('"name": "plugins-docs"'));
assert.ok(text(docs, "tools/deploy/wrangler.jsonc").includes('"pattern": "plugins.monte3l.com"'));
assert.ok(text(docs, "tools/deploy/package.json").includes('"name": "plugins-deploy-tools"'));
assert.ok(text(docs, "docs.config.mjs").includes('siteUrl: "https://plugins.monte3l.com"'));
assert.ok(text(docs, "docs.config.mjs").includes('repo: "https://github.com/monte3l/m3l-plugins"'));
assert.ok(text(docs, "docs.config.mjs").includes('title: "m3l-plugins"'));
assert.ok(!docs.files.filter((f) => !f.to.startsWith(".github/workflows/")).some((f) => /\bPROJECT\b/.test(f.text)), "no PROJECT is left in any starter (a workflow template keeps its own Adopting comment)");
assert.deepEqual(docs.unfilled.filter((u) => u.found.some((x) => /PROJECT|REPOSITORY/.test(x))), []);
// tracking starters: a new repository starts with the roadmap and the decision records, with the name and today's date filled in
const dated = go({ kind: "simple", today: "2026-12-24" });
const roadmap = text(dated, "ROADMAP.md");
assert.ok(roadmap !== undefined, "ROADMAP.md is written, with or without --docs");
assert.ok(text(docs, "ROADMAP.md") !== undefined && text(go({}), "ROADMAP.md") !== undefined);
assert.match(roadmap, /^reviewed: 2026-12-24$/m, "{date} is today's date");
assert.match(roadmap, /What m3l-plugins intends to do/, "{repo} is the name");
assert.ok(!/\{(repo|date)\}/.test(roadmap), "no token is left");
assert.deepEqual(roadmapProblems(roadmap, { today: "2026-12-24" }), [], "the starter passes the check the baseline runs, so a new repository starts without drift");
assert.ok(text(dated, "docs/decisions/README.md") !== undefined && text(dated, "docs/decisions/0000-template.md") !== undefined, "the decision records are written");
assert.ok(dated.todo.some((t) => t.startsWith("ROADMAP.md:") && t.includes("five sections")), "a person is told to write the sections");
assert.ok(!dated.unfilled.some((u) => u.to === "ROADMAP.md" || u.to.startsWith("docs/decisions/")), "no placeholder of ours is left in a tracking starter");
// The deploy lockfile is a reviewed starter, copied and never generated at bootstrap. It must still be the pair
// npm ci accepts: the same wrangler, a lock whose root names the repository, and an integrity hash everywhere.
const pkg = JSON.parse(text(docs, "tools/deploy/package.json"));
const lock = JSON.parse(text(docs, "tools/deploy/package-lock.json"));
assert.equal(lock.name, "plugins-deploy-tools", "the lock names the repository's subdomain, like package.json");
assert.equal(lock.packages[""].name, pkg.name);
assert.ok(!text(docs, "tools/deploy/package-lock.json").includes("PROJECT"), "no PROJECT is left in the lock");
assert.equal(lock.packages[""].dependencies.wrangler, pkg.dependencies.wrangler, "the lock asks for the same wrangler as package.json");
assert.equal(lock.packages["node_modules/wrangler"].version, pkg.dependencies.wrangler, "and locks exactly that version");
assert.deepEqual(Object.entries(lock.packages).filter(([, entry]) => entry.resolved && !entry.integrity).map(([key]) => key), [], "every resolved package carries an integrity hash");
assert.deepEqual(Object.keys(lock.packages).filter((key) => key.startsWith("../")), [], "no path of the machine that made it");
assert.ok(text(go({ kind: "simple" }), "tools/deploy/package-lock.json") === undefined, "no docs, no lock");
// the config the docs gate needs: no page for a file the repo does not have, no stale excludes, the marker excluded
const cfg = text(docs, "docs.config.mjs");
assert.ok(!cfg.includes("CONTRIBUTING.md") && !cfg.includes("CHANGELOG.md") && !cfg.includes(".claude/**"));
assert.ok(cfg.includes('glob: "design/README.md"') && cfg.includes('navGroups: ["Start", "Security"]'));
// negation: exactly one of each pair
assert.match(text(docs, "README.md"), /https:\/\/github\.com\/monte3l\/\.github\/blob\/main\/CONTRIBUTING\.md/, "docs README links the org CONTRIBUTING");
assert.doesNotMatch(text(docs, "README.md"), /\]\(CONTRIBUTING\.md\)/, "and no longer links a local one");
assert.ok(text(go({ kind: "simple" }), "README.md").includes("](CONTRIBUTING.md)"), "plain README keeps its local link");
assert.ok(text(docs, ".github/dependabot.yml").includes("directory: /tools/deploy"), "docs dependabot has the deploy entry");
assert.ok(!text(go({ kind: "simple" }), ".github/dependabot.yml").includes("directory: /tools/deploy"), "plain dependabot does not");
assert.ok(text(docs, ".github/dependency-review-config.yml").includes("pkg:npm/%40img/sharp-libvips-linux-x64"), "docs dependency-review config exempts the sharp binaries");
assert.ok(text(go({ kind: "simple" }), ".github/dependency-review-config.yml").includes("allow-dependencies-licenses: []"), "plain config is the empty list");
// marker: vendored tier with the date and the version
const dm = text(docs, "design/README.md");
assert.match(dm, /^- \*\*Version copied:\*\* `v\d+\.\d+\.\d+`$/m);
assert.match(dm, /^- \*\*Last re-synced:\*\* 2026-12-24$/m);
assert.match(dm, /^- \*\*Tier:\*\* vendored$/m);
// secrets and todos by condition
assert.deepEqual(docs.orgSecrets, ["GITLEAKS_LICENSE", "CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID", "JANITOR_APP_CLIENT_ID", "JANITOR_APP_PRIVATE_KEY"]);
assert.deepEqual(go({ kind: "simple" }).orgSecrets, ["GITLEAKS_LICENSE"]);
assert.ok(docs.todo.some((t) => t.includes("`dig plugins.monte3l.com`")), "the todo has the host filled in");
assert.ok(docs.todo.some((t) => t.includes('add "m3l-plugins" to "consumers"')));
assert.ok(!go({ kind: "simple" }).todo.some((t) => t.includes("docs site")), "no docs todos without docs");
assert.throws(() => go({ docs: true, scaffold: true }), /cannot be combined/);
// every rendered workflow of a docs repo is still identical to its template
for (const file of docs.files.filter((f) => f.to.startsWith(".github/workflows/"))) {
  const name = path.basename(file.to, ".yml");
  assert.equal(classify(file.text, render(base.read(`workflow-templates/${name}.yml`), { site: project.site, flags: [], defaultBranch: "main" }), []).state, "IDENTICAL", `${name} (docs)`);
}
// the sync entry matches the shape sync.json uses
assert.equal(out.syncEntry, '"m3l-plugins": { "flags": [] }');
console.log("BOOTSTRAP RENDER BEHAVES");
