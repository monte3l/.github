---
url: https://github.com/monte3l/.github/actions/runs/45711669137
accessed: 2026-11-25
---

# The freshness workflow's tracking-issue path: what two real runs did

**Source:** https://github.com/monte3l/.github/actions/runs/45711669137 · **Kind:** observation · **Accessed:** 2026-11-25

## What it says

Both runs were started by hand (`workflow_dispatch` with `probe` on) from the branch `worktree-freshness-probe`, with the job token (`issues: write`). Run logs were read through `gh run view --log`. The probe job calls `bin/lib/upsert-issue.sh` the way the four watcher jobs do.

- Before 2026-11-25, `freshness.yml` had no recorded run (`total_count: 0`), including the 2026-11-23 schedule. Other scheduled workflows ran that day.
- First run (45710753475): the pins, upstream, knowledge and copies jobs passed, each taking its "nothing to close" path. The probe opened #168 with the labels `freshness` and `area:ci` and the issue type Gap. The second call, 5 seconds later, did not find it and opened #169. The step stopped, and both issues were closed by hand.
- Second run (45711669137, after the probe waited until the list showed the issue): the probe opened #170, the list showed it after 5 seconds, the second call printed `is unchanged`, and the third call printed `closed #170`. All five jobs passed.

## Caveats

- Only the open, unchanged and close paths were exercised. The path that rewrites a body and adds a comment (the findings changed) was not.
- The delay is one observation of two. The cause (a list that lags behind a create) is inferred from the timing and was not confirmed.
- The four watcher jobs had nothing to report, so their own findings text was not posted.
- The 2026-11-23 schedule did not run, and the cause is unknown. The 2026-11-30 schedule has not happened yet.
