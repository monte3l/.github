#!/usr/bin/env bash
# SPDX-FileCopyrightText: Copyright (c) 2026 Enrico Lionello (enri3l) and Giulia Montevecchi (giulmonte), monte3l
# SPDX-License-Identifier: MIT
#
# Says whether a docs.config.mjs lists at least one parity module.
#
#   docs-config-parity.sh < docs.config.mjs
#
# Exit 0 when `parity:` is an array with at least one element, 1 when the key is
# missing, empty or only in a comment. The gate (`build.mjs --check`) proves the
# docs are well formed; a parity module proves they still say what the code does.
# Whole-line `//` comments are dropped first and the array may span lines. The
# text goes through a variable because `grep -q` ending a pipeline early would
# trip pipefail.
set -euo pipefail

flat="$(grep -Ev '^[[:space:]]*//' | tr '\n' ' ' || true)"
grep -Eq 'parity:[[:space:]]*\[[^]]*[A-Za-z]' <<<"$flat"
