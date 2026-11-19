// SPDX-FileCopyrightText: Copyright (c) 2026 Enrico Lionello (enri3l) and Giulia Montevecchi (giulmonte), monte3l
// SPDX-License-Identifier: MIT

// Runs tests/new-repo.test.sh, the harness for bin/new-repo.sh, so `node --test "tests/*.test.mjs"` covers it.
// The script under test runs with the bash on PATH, or with BASH_BIN (for example /bin/bash, 3.2 on macOS).
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

const harness = path.join(import.meta.dirname, "new-repo.test.sh");
const result = spawnSync("bash", [harness], { encoding: "utf8", env: process.env, maxBuffer: 64 * 1024 * 1024 });
const lines = `${result.stdout ?? ""}${result.stderr ?? ""}`.split("\n");
// On success the last lines are the tally. On failure the whole output says which case failed.
process.stdout.write(`${(result.status === 0 ? lines.slice(-4) : lines).join("\n")}\n`);
process.exit(result.status === 0 ? 0 : 1);
