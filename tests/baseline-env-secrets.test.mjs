// SPDX-FileCopyrightText: Copyright (c) 2026 Enrico Lionello (enri3l) and Giulia Montevecchi (giulmonte), monte3l
// SPDX-License-Identifier: MIT

// `env_secret_state` and `drop_org_shares` of apply-repo-baseline.sh, which the `env-janitor:` and
// `docs-cloudflare:` secret items print from. Like baseline-dependabot-lockfiles, this takes the real
// definitions out of the script and runs them under the script's own shell options, against a stub gh
// that answers by API path. The stub serves already-reduced answers, so what is tested is the script's
// reading of them: a 404 is "none", any other failure is "unreadable", never a clean result.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const root = path.join(import.meta.dirname, "..");
const lines = readFileSync(path.join(root, "bin", "apply-repo-baseline.sh"), "utf8").split("\n");

function definition(name) {
  const start = lines.findIndex((line) => line.startsWith(`${name}() {`));
  assert.ok(start >= 0, `${name}() is not in the script`);
  const end = lines.findIndex((line, i) => i > start && line === "}");
  return lines.slice(start, end + 1).join("\n");
}

const ERR404 = "gh: Not Found (HTTP 404)";
const ERR403 = "gh: Forbidden (HTTP 403)";

/**
 * @param {{ env: string[] | "404" | "403", org: Record<string, { visibility: string, ids?: string[] } | "404" | "403"> }} world
 *   env: names the environment holds, or the error its secrets call gives. org: per organization secret.
 */
function run(world, secrets, tail = "") {
  const orgCases = Object.entries(world.org)
    .map(([name, v]) => {
      if (v === "404" || v === "403") {
        const err = v === "404" ? ERR404 : ERR403;
        return `    "api orgs/monte3l/actions/secrets/${name} --jq .visibility") echo "${err}" >&2; return 1 ;;`;
      }
      return [
        `    "api orgs/monte3l/actions/secrets/${name} --jq .visibility") echo ${v.visibility} ;;`,
        `    "api --paginate orgs/monte3l/actions/secrets/${name}/repositories --jq .repositories[].id") printf '%s\\n' ${(v.ids ?? []).join(" ") || "''"} ;;`,
      ].join("\n");
    })
    .join("\n");
  const envCase = Array.isArray(world.env)
    ? `printf '%s\\n' ${world.env.join(" ") || "''"}`
    : `echo "${world.env === "404" ? ERR404 : ERR403}" >&2; return 1`;
  const program = `set -eEuo pipefail
trap 'exit 3' ERR
repo=monte3l/m3l-x mode=apply owner=monte3l repo_id=4242
calls=""
gh() {
  case "$*" in
    "api repos/monte3l/m3l-x/environments/e1/secrets --jq .secrets[].name") ${envCase} ;;
${orgCases}
    "api -X DELETE orgs/monte3l/actions/secrets/"*) echo "CALLED $*" >&2 ;;
    *) echo "unexpected gh call: $*" >&2; return 9 ;;
  esac
}
${definition("env_secret_state")}
${definition("drop_org_shares")}
env_secret_state e1 ${secrets.join(" ")}
echo "missing=[$es_missing] shared=[$es_shared] all=[$es_all] unreadable=[$es_unreadable] orgunreadable=[$es_org_unreadable]"
${tail}
`;
  const r = spawnSync("bash", ["-c", program], { encoding: "utf8" });
  return { status: r.status, out: r.stdout, err: r.stderr };
}

test("the environment holds every secret and no organization secret names the repository: clean", () => {
  const { status, out, err } = run(
    { env: ["A", "B"], org: { A: { visibility: "selected", ids: ["1", "2"] }, B: "404" } },
    ["A", "B"],
  );
  assert.equal(status, 0, err);
  assert.match(out, /missing=\[\] shared=\[\] all=\[\] unreadable=\[\] orgunreadable=\[\]/);
});

test("a secret the environment lacks is named, in order", () => {
  const { out } = run({ env: ["B"], org: { A: "404", B: "404" } }, ["A", "B"]);
  assert.match(out, /missing=\[A \]/);
});

test("an environment that does not exist (404) holds none, and is not unreadable", () => {
  const { out } = run({ env: "404", org: { A: "404", B: "404" } }, ["A", "B"]);
  assert.match(out, /missing=\[A B \] .*unreadable=\[\]/);
});

test("an environment the token cannot read is unreadable, never read as empty-and-fine", () => {
  const { out } = run({ env: "403", org: { A: "404", B: "404" } }, ["A", "B"]);
  assert.match(out, /unreadable=\[1\]/);
});

test("an organization secret shared with this repository is reported by name", () => {
  const { out } = run({ env: ["A", "B"], org: { A: { visibility: "selected", ids: ["7", "4242"] }, B: "404" } }, ["A", "B"]);
  assert.match(out, /shared=\[A \]/);
});

test("an organization secret visible to every repository is reported separately, without a list read", () => {
  const { out } = run({ env: ["A"], org: { A: { visibility: "all" } } }, ["A"]);
  assert.match(out, /shared=\[\] all=\[A \]/);
});

test("a visibility other than selected is drift, without reading a repository list", () => {
  for (const visibility of ["private", "internal"]) {
    const { out, err } = run({ env: ["A"], org: { A: { visibility } } }, ["A"]);
    assert.match(out, /shared=\[\] all=\[A \]/, visibility);
    assert.doesNotMatch(err, /unexpected gh call/);
  }
});

test("an organization secret the token cannot read (403) is flagged, not taken as absent", () => {
  const { out } = run({ env: ["A"], org: { A: "403" } }, ["A"]);
  assert.match(out, /orgunreadable=\[1\]/);
});

test("drop_org_shares in apply mode removes this repository from each list", () => {
  const { status, out, err } = run({ env: ["A", "B"], org: { A: "404", B: "404" } }, ["A", "B"], "drop_org_shares A B");
  assert.equal(status, 0, err);
  assert.match(err, /CALLED api -X DELETE orgs\/monte3l\/actions\/secrets\/A\/repositories\/4242/);
  assert.match(err, /CALLED api -X DELETE orgs\/monte3l\/actions\/secrets\/B\/repositories\/4242/);
  assert.match(out, /applied: A\n/);
});

test("drop_org_shares in dry-run mode prints the command and calls nothing", () => {
  const { out, err } = run({ env: ["A"], org: { A: "404" } }, ["A"], 'mode=dry-run\ndrop_org_shares A');
  assert.match(out, /would run: gh api -X DELETE orgs\/monte3l\/actions\/secrets\/A\/repositories\/4242/);
  assert.doesNotMatch(err, /CALLED/);
});

test("a failed removal stops the script instead of reporting success", () => {
  const program = `set -eEuo pipefail
trap 'exit 3' ERR
mode=apply owner=monte3l repo_id=4242
gh() { return 1; }
${definition("drop_org_shares")}
drop_org_shares A
echo reached
`;
  const r = spawnSync("bash", ["-c", program], { encoding: "utf8" });
  assert.equal(r.status, 3);
  assert.doesNotMatch(r.stdout, /reached|applied/);
});
