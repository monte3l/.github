import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { findProblems, parseCommands } from "../.claude/hooks/guard-shell-portability.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hook = path.join(root, ".claude/hooks/guard-shell-portability.mjs");

const ZSH = { shell: "/bin/zsh", platform: "linux" };
const MAC_BASH = { shell: "/bin/bash", platform: "darwin" };
const MAC_ZSH = { shell: "/bin/zsh", platform: "darwin" };
const LINUX_BASH = { shell: "/bin/bash", platform: "linux" };

const problems = (command, env) => findProblems(command, env);
const run = (command, env, stdin) =>
  spawnSync("node", [hook], {
    input: stdin ?? JSON.stringify({ tool_name: "Bash", tool_input: { command } }),
    encoding: "utf8",
    env: { ...process.env, SHELL: env.shell, ...(env.platform ? {} : {}) },
  });

describe("parseCommands", () => {
  const texts = (src) => parseCommands(src).map((words) => words.map((w) => w.value));

  it("splits on separators and keeps a quoted string as one word", () => {
    assert.deepEqual(texts('git commit -m "a b" && echo done; ls | wc'), [
      ["git", "commit", "-m", "a b"],
      ["echo", "done"],
      ["ls"],
      ["wc"],
    ]);
  });

  it("marks a quoted character so a glob in it is not read as unquoted", () => {
    const [[word]] = parseCommands("'*.ts'");
    assert.ok(!word.bare.includes("*"));
    const [[bare]] = parseCommands("*.ts");
    assert.ok(bare.bare.includes("*"));
  });

  it("drops a here-document body and keeps the commands around it", () => {
    assert.deepEqual(texts("cat <<'EOF'\n--include=*.ts and echo == x\nEOF\nls"), [["cat"], ["ls"]]);
    assert.deepEqual(texts("cat <<-EOF\n\tbody\n\tEOF\nls"), [["cat"], ["ls"]]);
  });

  it("parses a command substitution as commands of its own", () => {
    assert.deepEqual(texts("echo $(git log -1)"), [["git", "log", "-1"], ["echo", "$(git log -1)"]]);
    assert.deepEqual(texts('echo "$(date) now"'), [["date"], ["echo", "$(date) now"]]);
    assert.deepEqual(texts("echo `date`"), [["date"], ["echo", "`date`"]]);
  });

  it("does not read arithmetic or a redirect as a command", () => {
    assert.deepEqual(texts("echo $((1<<2))"), [["echo", "$((1<<2))"]]);
    assert.deepEqual(texts("make 2>&1 | tee log"), [["make", "2>&1"], ["tee", "log"]]);
    assert.deepEqual(texts("cmd &> out"), [["cmd", "&>", "out"]]);
  });

  it("ignores a comment, and throws on a construct it cannot read", () => {
    assert.deepEqual(texts("ls # --include=*.ts"), [["ls"]]);
    assert.throws(() => parseCommands("echo 'open"));
    assert.throws(() => parseCommands('echo "open'));
    assert.throws(() => parseCommands("echo $(open"));
  });
});

describe("guard-shell-portability: zsh", () => {
  it("blocks an unquoted glob attached to a flag", () => {
    for (const command of [
      'grep -rn "x" --include=*.mjs --include=*.ts .',
      "rg --glob=*.md todo",
      "git log -1 --format=%G?",
      "git log --format=%G? -3",
    ]) {
      assert.ok(problems(command, ZSH).length > 0, command);
    }
    assert.equal(problems('grep -rn x --include=*.mjs --include=*.ts .', ZSH).length, 2, "each distinct word is named once");
    assert.match(problems("grep x --include=*.ts .", ZSH)[0], /--include='\*\.ts'/, "the message shows the quoted form");
  });

  it("blocks an unquoted query string", () => {
    assert.match(problems("gh api repos/monte3l/.github/contents/x?ref=0df07a1", ZSH)[0], /query string/);
    assert.ok(problems("curl https://api.example.com/items?per_page=3", ZSH).length > 0);
  });

  it("blocks a multi-word variable used as a command, a loop list or set --", () => {
    assert.match(problems('C="node dist/cli.js --data-dir $D"; $C record-batch x', ZSH)[0], /several words/);
    assert.ok(problems('C="node x"; ${C} pack', ZSH).length > 0, "the braced form");
    assert.ok(problems('list="a b c"; for f in $list; do echo $f; done', ZSH).length > 0);
    assert.ok(
      problems('for pr in "monte3l/.github 122" "monte3l/m3l-design 7"; do set -- $pr; gh pr view $2 -R $1; done', ZSH).length > 0,
      "set -- $pr over quoted multi-word items",
    );
    assert.equal(problems('C="node x"; $C a; $C b', ZSH).length, 1, "one finding per variable");
    assert.ok(problems('C="$(which node) --check"; $C x', ZSH).length > 0, "a literal space next to a substitution still splits");
  });

  it("lets through what works in zsh", () => {
    for (const command of [
      "ls *.md",
      "rm -f dist/*.tmp",
      "for f in *.txt; do echo $f; done",
      "grep -rn x --include='*.ts' .",
      'grep -rn x --include="*.ts" .',
      "grep -rn x --include=\\*.ts .",
      "git log --format='%G?' -3",
      "curl 'https://api.example.com/items?per_page=3'",
      'gh api "repos/x/y?ref=z"',
      "echo '=='",
      'echo "== heading =="',
      "[[ $a == b* ]]",
      "[[ $a == --flag=* ]]",
      'case "$a" in --foo=*) echo foo;; esac',
      "echo = x",
      // These failed until 19 November 2026 and ran fine after: a zsh option the hook cannot see.
      "echo =====",
      "echo == $v",
      '[ "$a" == "$b" ]',
      "diff <(ls a) <(ls b)",
      "C=(node x); \"${C[@]}\" pack",
      'C="node x"; ${=C} pack',
      'C="node x"; "$C" pack',
      'MSG="hello world"; echo $MSG',
      "N=$(ls -d node_modules/node/bin/node 2>/dev/null); $N --version",
      'N="$(ls -d a b)"; $N --version',
      "N=`ls -d a b`; $N --version",
      'D="${HOME:-a b}"; $D x',
      'MSG="hello world"; git commit -s -m "$MSG"',
      "W=/tmp/dir; cd $W && ls",
      "for f in $(ls); do echo $f; done",
      'git commit -s -m "fix --include=*.ts and echo == handling"',
      "git commit -s -F - <<'EOF'\nfix --include=*.ts and echo == x\nEOF",
      "ls # --include=*.ts",
    ]) {
      assert.deepEqual(problems(command, ZSH), [], command);
    }
  });

  it("forgets a multi-word variable that is assigned something else later", () => {
    assert.deepEqual(problems('C="node x"; C=node; $C pack', ZSH), []);
    assert.deepEqual(problems('for f in "a b"; do :; done; for f in x y; do echo $f; done', ZSH), []);
  });

  it("does nothing under bash or on a shell it does not know", () => {
    for (const env of [LINUX_BASH, MAC_BASH, { shell: "", platform: "linux" }, { shell: "/usr/bin/fish", platform: "linux" }]) {
      assert.deepEqual(problems("grep x --include=*.ts . && curl https://a.example/b?c=1", env), [], JSON.stringify(env));
    }
  });
});

describe("guard-shell-portability: a glob that matches nothing", () => {
  let dir;
  before(() => {
    dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "guard-portability-")));
    fs.mkdirSync(path.join(dir, "docs"));
    fs.mkdirSync(path.join(dir, ".github"));
    fs.writeFileSync(path.join(dir, "docs", "a.md"), "");
    fs.writeFileSync(path.join(dir, "docs", ".hidden.md"), "");
    fs.writeFileSync(path.join(dir, "README.md"), "");
    fs.writeFileSync(path.join(dir, ".github", "pull_request_template.md"), "");
  });
  after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const at = (command, env = ZSH) => findProblems(command, { ...env, cwd: dir });

  it("blocks a plain path glob that matches nothing here", () => {
    for (const command of [
      "ls docs/*.zzz",
      "grep -n x CLAUDE.md README.md docs/*.txt 2>/dev/null",
      "ls .github/PULL_REQUEST_TEMPLATE*",
      "cat nodir/*.md",
      "ls no?.md",
      "for f in docs/*.zzz; do echo $f; done",
      "ls docs/*.zzz; echo done",
      "ls docs/*.zzz | head",
    ]) {
      assert.match(at(command)[0] ?? "", /matches nothing/, command);
    }
    assert.equal(at("ls docs/*.zzz docs/*.yyy").length, 2, "each pattern is named");
  });

  it("allows a glob that matches something, and honours the dotfile rule", () => {
    for (const command of [
      "ls docs/*.md",
      "ls *.md",
      "ls docs/a.m?",
      "ls .github/pull_request*",
      "ls .github/*",
      "ls d*/a.md",
      `ls ${dir}/docs/*.md`,
      "ls docs/.hid*",
    ]) {
      assert.deepEqual(at(command), [], command);
    }
    assert.ok(at("ls docs/*hidden*").length > 0, "* does not match a leading dot");
  });

  it("leaves a glob alone when the line could have changed what it means", () => {
    for (const command of [
      "touch docs/new.zzz && ls docs/*.zzz",
      "mkdir out; ls out/*",
      "git clone x y; ls y/*",
      "cd docs && ls *.zzz",
      "pushd docs; ls *.zzz",
      "setopt nonomatch; ls docs/*.zzz",
      "noglob ls docs/*.zzz",
      "source env.sh; ls docs/*.zzz",
      "echo $(ls) docs/*.zzz",
    ]) {
      assert.deepEqual(at(command), [], command);
    }
  });

  it("only judges what zsh would expand", () => {
    for (const command of [
      "ls 'docs/*.zzz'",
      'ls "docs/*.zzz"',
      "ls docs/\\*.zzz",
      "ls $HOME/*.zzz",
      "ls ~/*.zzz",
      "ls docs/{a,b}*.zzz",
      "ls docs/[a-b]*.zzz",
      "ls **/*.zzz",
      "ls docs/*.zzz/",
      "X=docs/*.zzz; ls $X",
      "export X=docs/*.zzz",
      "ls -*.zzz",
      "[[ $a == docs/*.zzz ]]",
      'case "$a" in docs/*.zzz) echo x;; esac',
    ]) {
      assert.deepEqual(at(command), [], command);
    }
  });

  it("does nothing without a directory, under bash or on macOS without zsh", () => {
    assert.deepEqual(findProblems("ls docs/*.zzz", ZSH), []);
    assert.deepEqual(at("ls docs/*.zzz", LINUX_BASH), []);
    assert.deepEqual(at("ls docs/*.zzz", MAC_BASH), []);
  });

  it("is checked by the process with the payload's cwd", () => {
    const payload = JSON.stringify({ tool_name: "Bash", cwd: dir, tool_input: { command: "ls docs/*.zzz" } });
    const r = run("", { shell: "/bin/zsh" }, payload);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /matches nothing/);
    const ok = JSON.stringify({ tool_name: "Bash", cwd: dir, tool_input: { command: "ls docs/*.md" } });
    assert.equal(run("", { shell: "/bin/zsh" }, ok).status, 0);
    const noCwd = JSON.stringify({ tool_name: "Bash", tool_input: { command: "ls docs/*.zzz" } });
    assert.equal(run("", { shell: "/bin/zsh" }, noCwd).status, 0, "no cwd, no judgement");
  });
});

describe("guard-shell-portability: macOS", () => {
  it("blocks sed -i without a backup suffix argument", () => {
    for (const command of [
      "sed -i 's/a/b/' file.txt",
      "sed -i -e 's/a/b/' file.txt",
      "sed -E -i 's/a/b/' file.txt",
      'sed -i "1d" file.txt',
      "sed -i /x/d file.txt",
    ]) {
      assert.match(problems(command, MAC_BASH)[0], /sed -i/, command);
    }
  });

  it("allows the forms BSD sed accepts", () => {
    for (const command of [
      "sed -i '' 's/a/b/' file.txt",
      'sed -i "" "s/a/b/" file.txt',
      "sed -i.bak 's/a/b/' file.txt",
      "sed -i .bak 's/a/b/' file.txt",
      "sed -n '1p' file.txt",
      "sed 's/a/b/' file.txt",
      "sed -e 's/a/b/' -i '' file.txt",
      "grep -i 'x' file",
      "echo sed -i x",
    ]) {
      assert.deepEqual(problems(command, MAC_BASH), [], command);
    }
  });

  it("blocks cat -A and head with a negative count", () => {
    assert.match(problems("cat -A file", MAC_BASH)[0], /cat -vet/);
    assert.ok(problems("cat -vA file", MAC_BASH).length > 0);
    assert.match(problems("head -n -3 file", MAC_BASH)[0], /count of 0 or less/);
    assert.ok(problems("head -n 0 file", MAC_BASH).length > 0, "BSD head rejects a count of 0");
    assert.ok(problems("head -c 0 file", MAC_BASH).length > 0);
    assert.ok(problems("git log | head -c -1", MAC_BASH).length > 0);
    for (const ok of ["cat -n file", "cat -et file", "head -n 3 file", "head -3 file", "head -n 10 file", "echo cat -A"]) {
      assert.deepEqual(problems(ok, MAC_BASH), [], ok);
    }
  });

  it("finds a rule after do, if, ! and an env prefix", () => {
    assert.ok(problems("for f in a b; do sed -i 's/a/b/' $f; done", MAC_BASH).length > 0);
    assert.ok(problems("if true; then sed -i 's/a/b/' f; fi", MAC_BASH).length > 0);
    assert.ok(problems("LC_ALL=C sed -i 's/a/b/' f", MAC_BASH).length > 0);
    assert.ok(problems("env LC_ALL=C sed -i 's/a/b/' f", MAC_BASH).length > 0);
  });

  it("does nothing on Linux", () => {
    assert.deepEqual(problems("sed -i 's/a/b/' f; cat -A f; head -n -3 f", LINUX_BASH), []);
    assert.deepEqual(problems("sed -i 's/a/b/' f; cat -A f; head -n -3 f", ZSH), []);
  });

  it("combines with the zsh rules and reports everything at once", () => {
    const found = problems("sed -i 's/a/b/' f && grep x --include=*.ts .", MAC_ZSH);
    assert.equal(found.length, 2);
  });
});

describe("guard-shell-portability: the process", () => {
  it("blocks with every problem named, and exits 0 for a clean command", () => {
    const bad = run("grep x --include=*.ts . && curl https://a.example/b?c=1", { shell: "/bin/zsh" });
    assert.equal(bad.status, 2);
    assert.match(bad.stderr, /guard-shell-portability/);
    assert.match(bad.stderr, /--include=\*\.ts/);
    assert.match(bad.stderr, /query string/);
    assert.equal(run("ls -la", { shell: "/bin/zsh" }).status, 0);
  });

  it("lets a bash user through", () => {
    const env = { shell: "/bin/bash" };
    // process.platform is the real one here, so only the zsh rules are certain to be off.
    assert.equal(run("grep x --include=*.ts .", env).status, 0);
  });

  it("allows a payload without a command, and a command it cannot parse", () => {
    for (const stdin of ["{}", '{"tool_input":{}}', '{"tool_input":{"command":""}}', '{"tool_input":{"command":5}}']) {
      assert.equal(run("", { shell: "/bin/zsh" }, stdin).status, 0, stdin);
    }
    assert.equal(run("echo 'unterminated --include=*.ts", { shell: "/bin/zsh" }).status, 0, "fails open on what it cannot read");
  });

  it("fails closed on a payload that is not a JSON object", () => {
    for (const stdin of ["not json", "", "null", "42", '"text"']) {
      const r = run("", { shell: "/bin/zsh" }, stdin);
      assert.equal(r.status, 2, stdin);
      assert.match(r.stderr, /could not read the hook payload/);
    }
  });
});
