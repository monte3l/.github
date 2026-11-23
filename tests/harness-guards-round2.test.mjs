// A second round of guard findings, each reproduced against the code before it was fixed:
//  - the worktree guard trusted `W=wt` after `&&`, `||`, a newline that continues them, or inside `if`, `case`
//    and a brace group, and read an expansion as a command word only at the start (`sudo $G commit`);
//  - the push guard skipped `git -C "$W" push` and `-C ~/x` (no real path, so "somewhere else"), and read
//    `$G push` as no push;
//  - the secret guard let a real-looking run through after a placeholder first value when nothing on the line
//    was a reference, and refused prose that names a repository after a reference.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { parseGitPushes, dirsToVet, trustedRoots } = await import(path.join(root, "bin/lib/signed-range.mjs"));
const { findSecrets } = await import(path.join(root, ".claude/hooks/guard-secret-writes.mjs"));

// No inherited GIT_* variable may point a test repository somewhere else.
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_") && key !== "CLAUDE_PROJECT_DIR"));
const hook = (name, payload) => spawnSync("node", [path.join(root, ".claude/hooks", name)], { input: JSON.stringify(payload), encoding: "utf8", env });
const git = (cwd, ...args) => {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", env });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
};
const quiet = ["-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false"];

describe("worktree guard: a variable is trusted only when it is set outright", () => {
  let tmp;
  let main;
  let linked;
  const bash = (command, cwd = main) => hook("guard-shared-checkout.mjs", { tool_name: "Bash", cwd, tool_input: { command } }).status;

  before(() => {
    tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "round2-wt-")));
    main = path.join(tmp, "repo");
    linked = path.join(tmp, "repo.wt", "feature");
    fs.mkdirSync(main);
    git(main, "init", "-q", "-b", "main");
    git(main, ...quiet, "commit", "-q", "--allow-empty", "-m", "init");
    git(main, "worktree", "add", "-q", linked, "-b", "feature");
  });
  after(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it("still judges a literal assignment set outright in the directory it names", () => {
    assert.equal(bash(`W=${linked}; git -C "$W" commit -m x`), 0);
    assert.equal(bash(`W=${linked}\ngit -C "$W" commit -m x`), 0);
    assert.equal(bash(`W=${main}; git -C "$W" commit -m x`), 2, "a variable that names the main checkout is still judged there");
    assert.equal(bash("git -C $W commit -m x"), 2, "an unset variable is judged from the cwd");
  });

  it("does not trust an assignment that follows && or ||, or a newline that continues one", () => {
    for (const command of [
      `false &&\nW=${linked}; git -C $W commit -m x`,
      `true ||\nW=${linked}; git -C $W commit -m x`,
      `echo x |\nW=${linked}; git -C $W commit -m x`,
      `true && echo hi; W=${linked}; git -C $W commit -m x`,
      `false || echo hi; W=${linked}; git -C $W commit -m x`,
      `false && W=${linked}; git -C $W commit -m x`,
    ]) {
      assert.equal(bash(command), 2, command);
    }
  });

  it("does not trust an assignment inside a compound command", () => {
    for (const command of [
      `if false\nthen\nW=${linked}\nfi\ngit -C $W commit -m x`,
      `if false; then W=${linked}; fi; git -C $W commit -m x`,
      `{\nW=${linked}\n}\ngit -C $W commit -m x`,
      `case x in\nx) W=${linked};;\nesac\ngit -C $W commit -m x`,
      `for i in 1; do W=${linked}; done; git -C $W commit -m x`,
      `while false; do W=${linked}; done; git -C $W commit -m x`,
      `! W=${linked}; git -C $W commit -m x`,
    ]) {
      assert.equal(bash(command), 2, command);
    }
  });

  it("keeps the continuation, not the newline, as what joins a command to the one before it", () => {
    // `cd X &&\n git commit` is still joined by `&&`, so the cd is followed: the commit runs in the worktree.
    assert.equal(bash(`cd ${linked} &&\ngit commit -s -m x`), 0);
    assert.equal(bash(`cd ${linked}\ngit commit -s -m x`, main), 2, "a newline alone leaves it uncertain, so the main checkout counts");
  });

  it("reads an expansion as the command word after a prefix, an option or a NAME=value word", () => {
    for (const command of [
      "G=git; $G commit -m x",
      "G=git; sudo $G commit -m x",
      "G=git; time $G commit -m x",
      "G=git; command $G commit -m x",
      "G=git; env X=1 $G commit -m x",
      "G=git; env -i X=1 $G commit -m x",
      "G=git; X=1 $G commit -m x",
      "G=git; nice -n 5 $G commit -m x",
      "G=git; timeout 5 $G commit -m x",
      "G=git; echo x | xargs $G commit -m x",
      "G=git; if true; then $G commit -m x; fi",
      "sudo `echo git` commit -m x",
      "G=git; exec $G commit -m x",
    ]) {
      assert.equal(bash(command), 2, command);
    }
    assert.equal(bash("G=git; $G commit -m x", linked), 0, "in a linked worktree it is fine");
  });

  it("does not take an expansion that is only an argument for a command", () => {
    for (const command of ["cp $A $B", "echo $HOME commit", "ls $X", "grep $P commit docs", "echo $G push", "make $TARGET checkout -b"]) {
      assert.equal(bash(command), 0, command);
    }
  });
});

describe("push guard: what cannot be placed, and an expansion as the command word", () => {
  let tmp;
  let repo;
  let other;
  let unsigned;

  before(() => {
    tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "round2-push-")));
    repo = path.join(tmp, "repo");
    other = path.join(tmp, "other");
    fs.mkdirSync(repo);
    fs.mkdirSync(other);
    git(repo, "init", "-q", "-b", "main");
    git(repo, ...quiet, "commit", "-q", "--allow-empty", "-m", "base");
    git(repo, "update-ref", "refs/remotes/origin/main", "HEAD");
    git(repo, "checkout", "-q", "-b", "topic");
    git(repo, ...quiet, "commit", "-q", "--allow-empty", "-m", "unsigned work");
    unsigned = git(repo, "rev-parse", "HEAD");
    git(repo, "checkout", "-q", "-b", "idle", "main");
    git(repo, "config", "commit.gpgsign", "true");
    // Another repository with an unsigned commit of its own, which the guard must not run git in.
    git(other, "init", "-q", "-b", "main");
    git(other, ...quiet, "commit", "-q", "--allow-empty", "-m", "theirs");
    git(other, "checkout", "-q", "-b", "topic");
    git(other, ...quiet, "commit", "-q", "--allow-empty", "-m", "theirs, unsigned");
    git(other, "config", "commit.gpgsign", "true");
  });
  after(() => fs.rmSync(tmp, { recursive: true, force: true }));

  const push = (command, cwd = repo, projectDir) =>
    spawnSync("node", [path.join(root, ".claude/hooks/guard-git-push-signed.mjs")], {
      input: JSON.stringify({ tool_name: "Bash", cwd, tool_input: { command } }),
      encoding: "utf8",
      env: projectDir ? { ...env, CLAUDE_PROJECT_DIR: projectDir } : env,
    });
  const blocks = (command, cwd = repo, projectDir) => {
    const r = push(command, cwd, projectDir);
    assert.equal(r.status, 2, `${command}: ${r.stderr}`);
    assert.match(r.stderr, new RegExp(unsigned.slice(0, 12)));
  };
  const allows = (command, cwd = repo, projectDir) => assert.equal(push(command, cwd, projectDir).status, 0, command);

  it("vets the hook's own directory for an operand that is built at run time or is no directory", () => {
    for (const command of [
      'git -C "$W" push origin topic',
      "git -C $W push origin topic",
      "git -C ${W} push origin topic",
      "git -C ~/somewhere push origin topic",
      'git -C "$(pwd)/x" push origin topic',
      "git -C `echo x` push origin topic",
      `git -C ${path.join(tmp, "gone")} push origin topic`,
      "git -C missing/dir push origin topic",
      'cd "$D" && git push origin topic',
      "cd ~/x && git push origin topic",
    ]) {
      blocks(command);
    }
  });

  it("still lets a push of a clean branch through, and a dry run", () => {
    allows('git -C "$W" push origin idle');
    allows('git -C "$W" push --dry-run origin topic');
    allows("git -C ~/x push origin :topic");
  });

  it("reads an expansion as the command word as a possible git, after a prefix too", () => {
    for (const command of [
      "$G push origin topic",
      "G=git; $G push origin topic",
      "sudo $G push origin topic",
      "env X=1 $G push origin topic",
      "X=1 $G push origin topic",
      "`echo git` push origin topic",
      "true && $G push origin topic",
      "echo x | xargs $G push origin topic",
    ]) {
      blocks(command);
    }
    for (const command of ["$G status", "ls $X", "echo $G push origin topic", "cp $A push", "$G log origin topic"]) allows(command);
  });

  it("keeps the documented exception: a real directory that is somebody else's repository is not vetted", () => {
    allows(`git -C ${other} push origin topic`);
    // A `cd` may have failed, so the hook's own repository is vetted as well as the one it names.
    assert.equal(push(`cd ${other} && git push origin topic`).status, 2);
    // Inside CLAUDE_PROJECT_DIR it is the project's own.
    const r = push(`git -C ${other} push origin topic`, repo, tmp);
    assert.equal(r.status, 2, r.stderr);
  });

  it("answers a path that cannot be placed with the hook's own directory, and drops only the foreign one", () => {
    const roots = trustedRoots(repo);
    assert.deepEqual(dirsToVet(repo, ["", "x"], roots), [repo], "a name that is no directory falls back to cwd, once");
    assert.deepEqual(dirsToVet(repo, ["$W"], roots), [repo]);
    assert.deepEqual(dirsToVet(repo, ["~/x"], roots), [repo]);
    assert.deepEqual(dirsToVet(repo, ["`echo x`"], roots), [repo]);
    assert.deepEqual(dirsToVet(repo, [path.join(tmp, "gone")], roots), [repo]);
    assert.deepEqual(dirsToVet(repo, [other], roots), [], "a real directory elsewhere is left unvetted");
    assert.deepEqual(dirsToVet(repo, [other, "$W"], roots), [repo]);
    assert.deepEqual(dirsToVet(repo, ["."], roots), [repo]);
  });

  it("reads where an expansion command word pushes, and nothing else", () => {
    assert.equal(parseGitPushes("$G push origin topic").length, 1);
    assert.equal(parseGitPushes("sudo $G push origin topic").length, 1);
    assert.equal(parseGitPushes("$G status").length, 0);
    assert.equal(parseGitPushes("echo $G push").length, 0);
    assert.equal(parseGitPushes("cp $A push").length, 0);
  });

  it("degrades to blocking the push when the helper does not have dirsToVet, as an older helper does not", () => {
    const dir = fs.mkdtempSync(path.join(tmp, "unit-"));
    fs.mkdirSync(path.join(dir, ".claude/hooks"), { recursive: true });
    fs.mkdirSync(path.join(dir, "bin/lib"), { recursive: true });
    fs.copyFileSync(path.join(root, ".claude/hooks/guard-git-push-signed.mjs"), path.join(dir, ".claude/hooks/guard-git-push-signed.mjs"));
    // The previous helper's exports: everything the guard needed then, `isTrustedDir` where `dirsToVet` is now.
    const names = ["parseGitPushes", "outgoingCommits", "unsignedCommits", "signingEnabled", "gitRunner", "trustedRoots", "isTrustedDir"];
    fs.writeFileSync(path.join(dir, "bin/lib/signed-range.mjs"), names.map((n) => `export function ${n}() { return []; }`).join("\n"));
    const run = (command) =>
      spawnSync("node", [path.join(dir, ".claude/hooks/guard-git-push-signed.mjs")], { input: JSON.stringify({ tool_name: "Bash", cwd: dir, tool_input: { command } }), encoding: "utf8", env });
    const r = run("git push origin HEAD");
    assert.equal(r.status, 2);
    assert.match(r.stderr, /signed-range\.mjs is missing or older than this guard/);
    assert.equal(run("git status").status, 0);
  });
});

describe("secret guard: the rest of the line is read whatever the first value was", () => {
  // Secret-shaped text is built here, so this file passes the secret guard it tests.
  const NPM = "NPM_" + "TOKEN";
  const GH = "GH_" + "TOKEN";
  const GITHUB = "GITHUB_" + "TOKEN";
  const mixed = "Zx9aB3c4D5e6F7g8H9i0";
  const ref = "${{ github.token }}";
  const blocked = (line) => assert.ok(findSecrets(line).length > 0, `should block: ${line}`);
  const allowed = (line) => assert.deepEqual(findSecrets(line), [], `should allow: ${line}`);

  it("blocks a real-looking run after a placeholder first value, with or without a reference on the line", () => {
    for (const line of [
      `${NPM}: changeme ${mixed}`,
      `${GH}=<token> ${mixed}`,
      `${NPM}: "" ${mixed}`,
      `${NPM}: '' ${mixed}`,
      `${NPM}: your-token-here ${mixed}`,
      `${NPM}: example ${mixed} and more text`,
      `${NPM}=... ${mixed}`,
      `${GH}: ${ref} ${mixed}`,
      `${GITHUB}: example-token ${["ghp", "A".repeat(36)].join("_")}`,
      `${NPM}: changeme 9a8b7c6d-5e4f-3a2b-1c0d-9e8f7a6b5c4d`,
      `${NPM}: changeme 3f2504e0-4f89-11d3-9a0c-0305e82c3301`,
    ]) {
      blocked(line);
    }
  });

  it("lets prose that names a repository or a package through, after a reference or a placeholder", () => {
    for (const line of [
      `${GH}: ${ref} so m3l-output-governor can read it`,
      `\`${GH}: ${ref}\` runs in m3l-prompt-optimizer and m3l-claude-mentor`,
      `${GH}: ${ref}   # read by m3l-output-governor, m3l-groundwork and claude-code-plugin`,
      `${NPM}: changeme for m3l-output-governor`,
      `${GH}: your-token-here, see the m3l-groundwork docs`,
      `${GITHUB}: <token> used by m3l-design-system-resync`,
      `${NPM}: \${{ secrets.${NPM} }} in the m3l-prompt-optimizer repository`,
    ]) {
      allowed(line);
    }
  });

  it("does not mistake a token for a repository name: digits first, no word, or a prefix", () => {
    for (const line of [
      `${GH}: ${ref} 9a8b7c6d-5e4f-3a2b-1c0d`,
      `${GH}: ${ref} a1b2c3d4-e5f6-a7b8-c9d0-e1f2a3b4c5d6`,
      `${GH}: ${ref} sk-${mixed}`,
      `${GH}: ${ref} ghp_${"A".repeat(36)}`,
    ]) {
      blocked(line);
    }
  });

  it("keeps the earlier cases: a literal, a default, a lookup, a reference", () => {
    blocked(`${NPM}=${mixed}J1k2L3m4N5`);
    blocked(`${GITHUB}: \${{ secrets.X || "${mixed}J1k2" }}`);
    allowed(`${GITHUB}: \${{ secrets.${GITHUB} }}`);
    allowed(`token = os.environ["${GITHUB}"]`);
    allowed(`${NPM}=process.env.${NPM}`);
    allowed(`${NPM}=short`);
  });
});

describe("secret guard: a hyphenated name is a name, and a token shaped like one is not", () => {
  const GH = "GH_" + "TOKEN";
  const NPM = "NPM_" + "TOKEN";
  const ref = "${{ github.token }}";
  // A run is judged the same after a reference, after a placeholder and inside a sentence.
  const lines = (run) => [`${GH}: ${ref} ${run}`, `${NPM}: changeme ${run}`, `${GH}: ${ref} so ${run} can read it`];
  const blocked = (run) => lines(run).forEach((line) => assert.ok(findSecrets(line).length > 0, `should block: ${line}`));
  const allowed = (run) => lines(run).forEach((line) => assert.deepEqual(findSecrets(line), [], `should allow: ${line}`));

  it("still lets a repository or package name through", () => {
    for (const name of [
      "m3l-output-governor",
      "m3l-prompt-optimizer",
      "m3l-claude-mentor",
      "m3l-design-system-resync",
      "claude-code-plugin",
      "key-value-store-service",
      "key-value-store-v2",
      "key-manager-v2-prod",
      "key-vault-name-s3x",
      "my-app-v2-service",
      "m3l-s3-bucket-name",
      "release-please-config",
      "dependency-review-action",
    ]) {
      allowed(name);
    }
  });

  it("blocks a token shaped like a name: a long part that mixes letters and digits, or groups of them", () => {
    for (const run of [
      "key-a1b2c3d4e5f6g7h8i9j0",
      "foo-a1b2c3d4e5f6g7h8i9j0",
      "app-b7e1f4a9c2d5e8f1a4b7",
      "token-a1b2c3d4e5f6g7h8",
      "my-app-a1b2c3d4e5f6",
      "tok-ab12-cd34-ef56-gh78-ij90",
      "svc-a1b2-c3d4-e5f6-a7b8-c9d0",
      "x-deadbeef1234deadbeef1234",
    ]) {
      blocked(run);
    }
  });

  it("blocks a token that starts with a digit or has a part that does, and a key- token with a digit", () => {
    // The long key- value is repeated at run time, so the file does not hold a literal that Gitleaks reads as a key.
    for (const run of ["abc-9f8e7d6c5b4a3f2e1d0c", "3f2504e0-4f89-11d3-9a0c-0305e82c3301", "key-ab12-cd34-ef56-gh78", `key-${"9f8e7d6c".repeat(4)}`]) {
      blocked(run);
    }
  });

  it("accepts at most two short parts that carry a digit, and no part of four characters or more with one", () => {
    allowed("m3l-s3-bucket-name");
    allowed("a2-b3-storage-service");
    blocked("a2-b3-c4-storage-service-1234567");
    blocked("my-service-ab123");
    // Blocked by design, as the README says: three short parts with a digit, or a part that starts with one.
    blocked("aws-s3-bucket-name-v2-eu1");
    blocked("key-rotation-job-2024");
  });
});

describe("secret guard: a template literal's interpolation of names and calls is a reference, not a value", () => {
  // Every key, token and interpolation is built here, so this file passes the guard it tests and holds no
  // key-like literal for Gitleaks to read.
  const GH = "GH_" + "TOKEN";
  const NPM = "NPM_" + "TOKEN";
  const GITHUB = "GITHUB_" + "TOKEN";
  const interp = (body) => "$" + "{" + body + "}";
  const mixed = "a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8";
  const tok = mixed.slice(0, 36);
  const ghp = ["ghp", tok].join("_");
  const blocked = (line) => assert.ok(findSecrets(line).length > 0, `should block: ${line}`);
  const allowed = (line) => assert.deepEqual(findSecrets(line), [], `should allow: ${line}`);

  it("lets a call or a path of names through, which is what test code that builds a token writes", () => {
    for (const line of [
      `${GH}: ${interp("randomToken()")}`,
      `${GH}: ${interp("makeToken(32)")}`,
      `${GH}: ${interp("makeToken(len, kind)")}`,
      `${GH}: ${interp("tokens.make(len, 32)")}`,
      `${GH}: ${interp(" randomToken() ")}`,
      `${GH}: ${interp("createRandomGithubToken(32)")}`,
      `${NPM}: ${interp("process.env." + NPM)}`,
      `${NPM}: ${interp("process.env." + GITHUB + "_FOR_TESTS")}`,
      `${NPM}: ${interp("config.tokens.npm")}`,
      `${NPM}=${interp("KEY")}`,
      `${GITHUB}=${interp("makeToken()")}`,
    ]) {
      allowed(line);
    }
  });

  it("lets it through inside a template literal, a YAML block in one, and a sentence", () => {
    for (const line of [
      "const line = `" + GH + ": " + interp("randomToken()") + "`;",
      "const line = `" + GH + ": " + interp("token") + "`;",
      "const workflow = `env:\n  " + GH + ": " + interp("randomToken()") + "\n`;",
      `${GH}: ${interp("randomToken()")} is built for each test`,
      `${GH}: ${interp("randomToken()")} so m3l-output-governor can read it`,
      `${GH}: ${interp("randomToken()")}   # read by m3l-groundwork`,
    ]) {
      allowed(line);
    }
  });

  it("still blocks a literal next to the interpolation, before it or after it", () => {
    for (const line of [
      `${GH}: ${tok}`,
      `${GH}: ${ghp}`,
      `${GH}: ${interp("X")}${ghp}`,
      `${GH}: ${ghp}${interp("X")}`,
      `${GH}: ${interp("randomToken()")}${ghp}`,
      `${GH}: ${ghp}${interp("randomToken()")}`,
      `${GH}: ${interp("randomToken()")} then ${tok}`,
      `${GH}: ${interp("randomToken()")}"${ghp}"`,
      `${GH}: ${interp("randomToken()")}||${ghp}`,
      `${GH}: ${interp("randomToken()")}?${ghp}`,
      `${GH}: ${interp("randomToken()")} || "${ghp}"`,
      "const line = `" + GH + ": " + ghp + interp("suffix") + "`;",
    ]) {
      blocked(line);
    }
  });

  it("still blocks a literal inside the interpolation: a default, a call argument, a template", () => {
    for (const line of [
      `${GH}: ${interp(`X || "${ghp}"`)}`,
      `${GH}: ${interp(`X ?? '${ghp}'`)}`,
      `${GH}: ${interp(`fn("${ghp}")`)}`,
      `${GH}: ${interp(`fn('${ghp}')`)}`,
      `${GH}: ${interp(`fn("${tok}")`)}`,
      `${GH}: ${interp(`make(fn("${ghp}"))`)}`,
      `${GH}: ${interp("fn(`" + ghp + "`)")}`,
    ]) {
      blocked(line);
    }
  });

  it("reads a name that is spelled like a token as one", () => {
    blocked(`${GH}: ${interp(ghp)}`);
    blocked(`${GH}: ${interp(`fn(${ghp})`)}`);
    blocked(`${GH}: ${interp(`tokens.${ghp}`)}`);
    blocked(`${GH}: ${interp("sk-" + mixed.slice(0, 20))}`);
  });

  it("accepts only a strict grammar as a reference: names of at most 32 characters, numbers of at most 4 digits", () => {
    // Outside the grammar the body is read as a value: a token, a long name, a long number, a dollar sign.
    for (const line of [
      `${GH}: ${interp(`fn(${ghp})`)}`,
      `${GH}: ${interp(`a.b.${tok}`)}`,
      `${GH}: ${interp(`a.b.${["sk", tok].join("_")}`)}`,
      `${GH}: ${interp("make(" + "12345678901234567890" + ")")}`,
      `${GH}: ${interp("make(32, " + "9".repeat(16) + ")")}`,
      `${GH}: ${interp("make(" + "9".repeat(15) + ")")}`,
      `${GH}: ${interp(`tokens.make(${tok})`)}`,
      `${GH}: ${interp("a.b." + "c".repeat(41))}`,
      `${GH}: ${interp("$" + ghp)}`,
      `${GH}: ${interp("$" + tok)}`,
      `${GH}: ${interp(`fn($${tok})`)}`,
      `${GH}: ${interp(`fn(a, $${ghp})`)}`,
      `${GH}: ${interp(`X || "${ghp}"`)}`,
      `${GH}: ${interp("{" + ghp + "}")}`,
      // Blocked by design, as the README says: a long camelCase name that has a digit reads as a random run.
      `${NPM}: ${interp("ctx.runner.accessToken2Value")}`,
    ]) {
      blocked(line);
    }
    for (const line of [
      `${GH}: ${interp("tokens.make(len, 32)")}`,
      `${GH}: ${interp("make(1234)")}`,
      `${NPM}: ${interp("ctx.runner.accessToken")}`,
      `${NPM}: ${interp("ctx.runner.accessToken2")}`,
      `${NPM}: ${interp("sha256Hash")}`,
      `${NPM}: ${interp("process.env.npm_config_cache")}`,
    ]) {
      allowed(line);
    }
  });

  it("takes $NAME and ${NAME} as a reference only when NAME is a name: short, no token prefix, no random mix", () => {
    for (const name of [GITHUB, NPM, "HOME", "npm_config_cache", "githubTokenForTests", "RUNNER_TEMP"]) {
      allowed(`${GH}: $${name}`);
      allowed(`${NPM}=${interp(name)}`);
    }
    const aws = ["AKIA", "ABCDEFGHIJKLMNOP"].join("");
    for (const name of [ghp, ["sk", tok].join("_"), ["ghp", tok.toLowerCase()].join("_"), aws, tok, "A".repeat(60)]) {
      blocked(`${GH}: $${name}`);
      blocked(`${NPM}=${interp(name)}`);
    }
    // A name longer than a name is a value inside an interpolation of names too.
    blocked(`${GH}: ${interp(`tokens.${"a".repeat(41)}`)}`);
  });
});
