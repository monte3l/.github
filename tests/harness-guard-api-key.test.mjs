// The secret guard reads `API_KEY` as a key whose assigned value is a secret, like `NPM_TOKEN`. A
// literal is blocked; a reference, a placeholder, an env-name lookup and prose about the key are not.
// Every value is assembled at run time, so this file carries no token-shaped text for Gitleaks.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const guard = path.join(root, ".claude/hooks/guard-secret-writes.mjs");
const starter = path.join(root, "blueprint/files/guard-secret-writes.mjs");
const { findSecrets, SECRET_KEYS } = await import(guard);

const KEY = ["API", "KEY"].join("_");
const value = ["Zq8Xw3", "Lp7Rt5", "Yn2Kd9", "Bv4Mc6"].join("");
const blocked = (line) => assert.ok(findSecrets(line).length > 0, `should block: ${line}`);
const allowed = (line) => assert.deepEqual(findSecrets(line), [], `should allow: ${line}`);

describe("secret guard: API_KEY", () => {
  it("lists the key, and the starter is the same file as the repository's own copy", () => {
    assert.ok(SECRET_KEYS.includes(KEY));
    assert.equal(fs.readFileSync(starter, "utf8"), fs.readFileSync(guard, "utf8"));
  });

  it("blocks a literal in the usual assignment forms, in any case", () => {
    blocked(`${KEY}=${value}`);
    blocked(`${KEY}: ${value}`);
    blocked(`export ${KEY}="${value}"`);
    blocked(`"${KEY}": "${value}"`);
    blocked(`${KEY.toLowerCase()} = '${value}'`);
    blocked(`${KEY} => ${value}`);
  });

  it("allows a reference, an env lookup, a placeholder and a dummy", () => {
    allowed(`${KEY}=\${${KEY}}`);
    allowed(`${KEY}=$${KEY}`);
    allowed(`${KEY}: \${{ secrets.${KEY} }}`);
    allowed(`${KEY}=process.env.${KEY}`);
    allowed(`${KEY.toLowerCase()} = os.environ["${KEY}"]`);
    allowed(`${KEY}=<your-key>`);
    allowed(`${KEY}=your_key_here`);
    allowed(`${KEY}=example-key`);
    allowed(`${KEY}=`);
    allowed(`${KEY}=...`);
  });

  it("allows prose about the key and a longer name that starts with it", () => {
    allowed(`\`${KEY}\`: the key the service gives you`);
    allowed(`${KEY}_FILE=/run/secrets/key`);
  });

  it("still blocks a literal default after a lookup", () => {
    blocked(`${KEY.toLowerCase()} = os.environ.get("${KEY}", "${value}")`);
  });

  it("is enforced by the hook itself, which exits 2 and names the key", () => {
    const run = (content) =>
      spawnSync("node", [guard], {
        input: JSON.stringify({ tool_name: "Write", tool_input: { file_path: path.join(root, "x.sh"), content } }),
        encoding: "utf8",
      });
    const hit = run(`${KEY}=${value}\n`);
    assert.equal(hit.status, 2);
    assert.match(hit.stderr, new RegExp(KEY));
    assert.equal(run(`${KEY}=\${${KEY}}\n`).status, 0);
  });
});
