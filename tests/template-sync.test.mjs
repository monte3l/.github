// SPDX-FileCopyrightText: Copyright (c) 2026 Enrico Lionello (enri3l) and Giulia Montevecchi (giulmonte), monte3l
// SPDX-License-Identifier: MIT

// The template sync classifier: render, lenient and strict comparison, and what may never be called stale.
// Run with: node --test "tests/*.test.mjs"
const { classify, render, lenient, strict, jobNames, unitsFor, describeStale } = await import(new URL("../bin/lib/template-sync.mjs", import.meta.url).href);
let failed = 0;
const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n       got  ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`}`); if (!ok) failed++; };
const throws = (name, fn, re) => { let msg = null; try { fn(); } catch (e) { msg = e.message; } const ok = msg !== null && re.test(msg); console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n       got ${msg}`}`); if (!ok) failed++; };
const T = (extra = "") => `# SPDX-FileCopyrightText: x
# SPDX-License-Identifier: MIT
name: Demo
# a comment
permissions:
  id-token: write # to publish
jobs:
  a:
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7
      - run: echo "hello"${extra}
`;
const cur = T();
const PIN2 = "a".repeat(40);
console.log("--- harmless differences are EQUIVALENT: nothing happens");
eq("identical", classify(cur, cur).state, "IDENTICAL");
eq("a different comment", classify(cur.replace("# a comment", "# another"), cur).state, "EQUIVALENT");
eq("a different SPDX header", classify(cur.replace("x\n", "Copyright the other contributors\n"), cur).state, "EQUIVALENT");
eq("blank lines", classify(cur.replace("name: Demo\n", "name: Demo\n\n\n"), cur).state, "EQUIVALENT");
eq("a different trailing comment on a simple value", classify(cur.replace("# to publish", "# to publish results (publish_results: true)"), cur).state, "EQUIVALENT");
eq("a different action pin (Dependabot's business)", classify(cur.replace("3d3c42e5aac5ba805825da76410c181273ba90b1", PIN2), cur).state, "EQUIVALENT");
eq("CRLF line endings are not behaviour", classify(cur.replace(/\n/g, "\r\n"), cur).state, "IDENTICAL");
console.log("--- real changes are CUSTOM");
eq("a changed run line", classify(cur.replace('echo "hello"', 'echo "goodbye"'), cur).state, "CUSTOM");
eq("an added step", classify(cur + "      - run: make\n", cur).state, "CUSTOM");
eq("a changed permission", classify(cur.replace("id-token: write", "id-token: none"), cur).state, "CUSTOM");
eq("a # inside a quoted string is NOT a comment", classify(cur.replace('echo "hello"', 'echo "a # b"'), cur.replace('echo "hello"', 'echo "a # c"')).state, "CUSTOM");
eq("reordered keys are a person's change, to be safe", classify("name: D\nenv:\n  A: 1\n  B: 2\n", "name: D\nenv:\n  B: 2\n  A: 1\n").state, "CUSTOM");
console.log("--- STALE needs a STRICT match with a real older version");
const v1 = T(" && echo one"), v2 = T(" && echo two");
eq("equals the version one back", classify(v1, cur, [v1, v2]), { state: "STALE", back: 1 });
eq("equals the version two back", classify(v2, cur, [v1, v2]), { state: "STALE", back: 2 });
eq("stale modulo pins, SPDX and blank lines only", classify(v1.replace("3d3c42e5aac5ba805825da76410c181273ba90b1", PIN2).replace("x\n", "other\n\n"), cur, [v1]).state, "STALE");
eq("an old version PLUS a person's change is CUSTOM", classify(v1.replace('echo "hello"', 'echo "mine"'), cur, [v1]).state, "CUSTOM");
eq("an old version with an added step is CUSTOM", classify(v1 + "      - run: extra\n", cur, [v1]).state, "CUSTOM");
eq("matches no version at all is CUSTOM", classify(T(" && echo three"), cur, [v1, v2]).state, "CUSTOM");
eq("no history means nothing can be stale", classify(v1, cur, []).state, "CUSTOM");
eq("an old version with DIFFERENT COMMENTS is CUSTOM, never STALE (comments count for a refresh)", classify(v1.replace("# a comment", "# mine"), cur, [v1]).state, "CUSTOM");
console.log("--- the reviewer's cases: text that looks like a comment is not always one");
const base = (steps) => `name: Demo\njobs:\n  a:\n    steps:\n${steps}`;
const s1 = base("      - run: build\n"), s2 = base("      - run: build\n      - run: npm test\n");
eq("A: a step a person commented out on purpose", classify(base("      - run: build\n      # - run: npm test  # flaky on our runner\n"), s2, [s1]).state, "CUSTOM");
const h1 = base("      - run: |\n          cat <<EOF\n          # Weekly report\n          EOF\n"), h2 = h1.replace("EOF\n", "EOF\n      - run: more\n");
eq("B: an edited heredoc heading in a run block", classify(h1.replace("# Weekly report", "# Our own heading"), h2, [h1]).state, "CUSTOM");
const j1 = base("      - uses: actions/github-script@v9\n        with:\n          script: |\n            class A { #secret = 1 }\n"), j2 = j1 + "      - run: more\n";
eq("C: a JavaScript private field changed in a script block", classify(j1.replace("#secret = 1", "#secret = 2"), j2, [j1]).state, "CUSTOM");
eq("an unmodified old copy is still STALE", classify(h1, h2, [h1]).state, "STALE");
console.log("--- back counts behaviour changes, not commits");
const c1 = T(" && echo one"), c1comment = c1.replace("# a comment", "# reworded"), c1pin = c1.replace("3d3c42e5aac5ba805825da76410c181273ba90b1", PIN2);
eq("comment-only and pin-only old versions do not push back up", classify(v2, cur, [c1comment, c1pin, c1, v2]), { state: "STALE", back: 2 });
const cur2 = T(" && echo one").replace("# a comment", "# x");
eq("an old version that behaves like the current one is not behind", classify(c1, cur2, [cur, c1]).state, "EQUIVALENT");
console.log("--- render");
const tpl = "url: https://PROJECT.monte3l.com\nbranches: [$default-branch]\n# sync:if manifest\n- run: meta\n# sync:end\nend\n";
eq("fills the site and the branch", render(tpl, { site: "https://x.monte3l.com", flags: ["manifest"] }), "url: https://x.monte3l.com\nbranches: [main]\n- run: meta\nend\n");
eq("drops a block whose flag is off", render(tpl, { site: "https://x.monte3l.com", flags: [] }), "url: https://x.monte3l.com\nbranches: [main]\nend\n");
eq("a flag does not leak into the next block", render("# sync:if a\nA\n# sync:end\nB\n# sync:if b\nC\n# sync:end\n", { flags: ["b"] }), "B\nC\n");
eq("never leaves a marker behind", /sync:/.test(render(tpl, { flags: ["manifest"] })), false);
eq("a site with trailing slashes", render("https://PROJECT.monte3l.com/x", { site: "https://s.example.com//" }), "https://s.example.com/x");
throws("a block opened inside a block", () => render("# sync:if a\n# sync:if b\nx\n# sync:end\ny\n# sync:end\n", { flags: [] }), /opens inside another/);
throws("a block that is never closed", () => render("# sync:if a\nx\n", { flags: [] }), /never closed/);
throws("an end with no start", () => render("x\n# sync:end\n", { flags: [] }), /no sync:if/);
throws("a marker with a trailing note is rejected, not ignored", () => render("# sync:if manifest  # note\nx\n# sync:end\n", { flags: [] }), /not a valid sync marker/);
console.log("--- normalize");
eq("lenient keeps a quoted # on a code line", lenient('run: echo "a # b"\n'), ['run: echo "a # b"']);
eq("strict keeps comments", strict("# keep\nrun: x\n"), ["# keep", "run: x"]);
console.log("--- hostile input stays fast (CodeQL's js/polynomial-redos)");
const time = (fn) => { const t0 = performance.now(); fn(); return performance.now() - t0; };
for (const [name, text] of [["uses: repeated", "uses:".repeat(200000)], ["an @ and hex run", "uses: a@" + "f".repeat(1000000)], ["spaces", " ".repeat(1000000) + "x"], ["hash runs", "key: v " + "# ".repeat(500000)]]) {
  const ms = Math.max(time(() => lenient(text)), time(() => strict(text)));
  eq(`1 MB of ${name} is processed in under 1 s (took ${Math.round(ms)} ms)`, ms < 1000, true);
}
eq("500 KB of slashes after a site is trimmed in under 1 s", time(() => render("https://PROJECT.monte3l.com", { site: "https://a/" + "/".repeat(500000) })) < 1000, true);

// The job names a required check depends on. A refresh that changes this set would stop a check `main` waits for.
const wf = (body) => `name: x\non: push\njobs:\n${body}`;
eq("job names are collected and sorted", jobNames(wf("  a:\n    name: Gitleaks\n    runs-on: x\n  b:\n    name: 'DCO sign-off'\n")), ["DCO sign-off", "Gitleaks"]);
eq("a job without a name has none", jobNames(wf("  a:\n    runs-on: x\n")), []);
eq("a step name is not a job name", jobNames("name: top\njobs:\n  a:\n    name: A\n    steps:\n      - name: step\n"), ["A"]);
eq("a name after the jobs block is not a job name", jobNames("jobs:\n  a:\n    name: A\npermissions: {}\n    name: nope\n"), ["A"]);
eq("CRLF line endings are read", jobNames("jobs:\r\n  a:\r\n    name: A\r\n"), ["A"]);
eq("a top-level name is not a job name", jobNames("name: A\n    name: B\n"), []);

// Adversarial input must stay linear: the classifier once took 158 s on a 1 MB input. The bound is generous
// (a slow CI runner is far from it) and catches only a return to quadratic or worse behaviour.
const N = 100_000;
const hostile = {
  "uses: repeated": "uses:".repeat(N / 5),
  "uses: x then spaces": `uses: x${" ".repeat(N)}y`,
  "key: v then spaces": `a: b${" ".repeat(N)}c`,
  "leading spaces": `${" ".repeat(N)}x`,
  "dashes and spaces": `${"- ".repeat(N / 2)}x`,
  "a long key with no colon": "a".repeat(N),
  "repeated key colon": "a: ".repeat(N / 3),
  "uses: then repeated at": `uses: ${"a@".repeat(N / 2)}`,
  "repeated pin-like text": `${`uses:a@${"0".repeat(39)} `.repeat(N / 47)}`,
  "sync:if then spaces": `# sync:if ${" ".repeat(N)}x y`,
  "repeated hash": "#".repeat(N),
  "tabs": `${"\t".repeat(N)}x: y\t#`,
};
for (const [name, input] of Object.entries(hostile)) {
  eq(`hostile input stays fast (${name}): lenient, strict and classify`, time(() => { lenient(input); strict(input); classify(input, "name: x\n", []); }) < 2000, true);
}
// What is compared for one repository: the workflow templates, then the starters, at the paths the repository keeps them at.
console.log("--- units: templates and starters, and where a repository keeps them");
const cfg = {
  templates: { b: "managed", a: "unmanaged" },
  starters: { "x.toml": { mode: "managed", paths: [".x.toml", "conf/x.toml"] }, "y.cfg": { mode: "unmanaged", paths: [".y"] } },
  repos: { r: { paths: { a: "ci.yml", "x.toml": "custom/x.toml" } }, s: {} },
};
const names = (units) => units.map((u) => `${u.kind}:${u.name}`);
eq("workflows come first, each group sorted by name", names(unitsFor(cfg, "s")), ["workflow:a", "workflow:b", "starter:x.toml", "starter:y.cfg"]);
eq("modes become managed flags", unitsFor(cfg, "s").map((u) => u.managed), [false, true, true, false]);
eq("a workflow is at .github/workflows/NAME.yml and has its template as the source", [unitsFor(cfg, "s")[1].paths, unitsFor(cfg, "s")[1].source], [[".github/workflows/b.yml"], "workflow-templates/b.yml"]);
eq("a starter has every path it may be at, and blueprint/files as the source", [unitsFor(cfg, "s")[2].paths, unitsFor(cfg, "s")[2].source], [[".x.toml", "conf/x.toml"], "blueprint/files/x.toml"]);
eq("a repository path replaces a workflow's path", unitsFor(cfg, "r")[0].paths, ["ci.yml"]);
eq("a repository path replaces a starter's list, not just its first entry", unitsFor(cfg, "r").find((u) => u.name === "x.toml").paths, ["custom/x.toml"]);
eq("another repository is not affected", unitsFor(cfg, "s")[0].paths, [".github/workflows/a.yml"]);
eq("an unknown repository gets the defaults", unitsFor(cfg, "nope")[0].paths, [".github/workflows/a.yml"]);
eq("a config without starters has only workflows", names(unitsFor({ templates: { a: "managed" } }, "s")), ["workflow:a"]);

console.log("--- findings keep their wording");
eq("a workflow reads as it always did", describeStale({ repo: "m3l-x", template: "dco", kind: "workflow", path: ".github/workflows/dco.yml", back: 1 }), "m3l-x: dco.yml is 1 version behind its template");
eq("a starter names its path and says starter", describeStale({ repo: "m3l-x", template: "gitleaks.toml", kind: "starter", path: ".gitleaks.toml", back: 2 }), "m3l-x: .gitleaks.toml is 2 versions behind its starter");

console.log("--- a starter is compared like a workflow: only a strict match with an older version is stale");
const g1 = "# Gitleaks config\n[extend]\nuseDefault = true\n";
const g2 = `${g1}\n[[rules]]\nid = "x"\n`;
eq("an untouched older starter is STALE", classify(g1, g2, [g1]), { state: "STALE", back: 1 });
eq("the current starter is IDENTICAL", classify(g2, g2, [g1]).state, "IDENTICAL");
eq("an older starter plus a person's allowlist is CUSTOM, never overwritten", classify(`${g1}[[allowlists]]\nregexes = ["fake"]\n`, g2, [g1]).state, "CUSTOM");
eq("an older starter with an edited comment is CUSTOM", classify(g1.replace("# Gitleaks config", "# ours"), g2, [g1]).state, "CUSTOM");
eq("only a comment differing from the current starter is EQUIVALENT", classify(g2.replace("# Gitleaks config", "# other words"), g2).state, "EQUIVALENT");
eq("a starter with no history cannot be stale", classify(g1, g2, []).state, "CUSTOM");

console.log(failed ? `\n${failed} FAILED` : "\nALL CLASSIFIER CASES BEHAVE"); process.exit(failed ? 1 : 0);
