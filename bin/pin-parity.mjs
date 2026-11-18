// SPDX-FileCopyrightText: Copyright (c) 2026 Enrico Lionello (enri3l) and Giulia Montevecchi (giulmonte), monte3l
// SPDX-License-Identifier: MIT

/**
 * Parity for the hand-pinned tool versions in `blueprint/pins.json`, run by the
 * docs kit's `--check` (listed in `docs.config.mjs` `parity`). Dependabot does
 * not read these values, so `pins.json` is the one record. It fails when a
 * listed file does not carry the pinned version, or carries another version
 * next to it, so a bump that misses one copy cannot merge.
 *
 * Offline on purpose: whether a pin is stale is `bin/pin-freshness.sh`'s job.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * @param {{name: string, version: string, pattern: string, files: string[]}} pin
 * @param {string} file path shown in messages
 * @param {string} text the file's content
 * @returns {string[]}
 */
export function pinProblems(pin, file, text) {
  if (!pin.pattern.includes("{version}")) return [`blueprint/pins.json: ${pin.name} pattern has no {version}`];
  const [before, after] = pin.pattern.split("{version}").map(escape);
  const found = [...text.matchAll(new RegExp(`${before}([^"\\s]+)${after}`, "g"))].map((m) => m[1]);
  if (found.length === 0) return [`${file}: no ${pin.name} pin matches \`${pin.pattern}\``];
  return found.filter((v) => v !== pin.version).map((v) => `${file}: ${pin.name} pins ${v}, blueprint/pins.json says ${pin.version}`);
}

export default async function parity({ root }) {
  const pins = JSON.parse(await readFile(path.join(root, "blueprint/pins.json"), "utf8"));
  const problems = [];
  for (const pin of pins) {
    for (const file of pin.files) {
      let text;
      try {
        text = await readFile(path.join(root, file), "utf8");
      } catch {
        problems.push(`blueprint/pins.json: ${pin.name} lists ${file}, which does not exist`);
        continue;
      }
      problems.push(...pinProblems(pin, file, text));
    }
  }
  return problems;
}
