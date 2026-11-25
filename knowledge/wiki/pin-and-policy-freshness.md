---
reviewed: 2026-11-19
sources:
  - raw/dependabot-options-reference.md
  - raw/renovate-custom-managers.md
  - raw/ossf-scorecard-checks.md
  - raw/ossf-best-practices-criteria.md
  - raw/ossf-security-baseline-releases.md
  - raw/reuse-spec-changelog.md
  - raw/freshness-probe-observation.md
---

# Keeping pinned tools and upstream policies current

**Status:** Decision · **Reviewed:** 2026-11-19

Two kinds of value go stale without anything noticing. Tool versions pinned by hand, such as the Gitleaks version, the actionlint image and the zizmor version, are not read by Dependabot. Policies the standard follows, such as the OpenSSF Scorecard checks, change on someone else's schedule. A weekly job in `freshness.yml` watches each and keeps one issue per concern.

## Hand-pinned versions

[Dependabot](../raw/dependabot-options-reference.md) updates `uses:` references, including reusable workflows, and no page says it reads another version string. It also applies a 3-day cooldown by default, and the organization sets 7 days. `blueprint/pins.json` records each hand pin and the files that carry it. `bin/pin-parity.mjs` fails the build when a copy is missed, and `bin/pin-freshness.sh` reports a pin behind the newest release that is at least seven days old, to match the cooldown.

**Why a report and not Renovate.** [Renovate](../raw/renovate-custom-managers.md) can do this with a regex manager and has its own cooldown. It would need a bot with write access to workflow files, and its signed commits (`platformCommit`) need it to run as a GitHub App. A weekly issue and a human pull request avoid both, and Renovate stays an option if the number of pins grows.

## Upstream policies

`blueprint/upstream.json` records the value of each source that a person last reviewed, and `bin/upstream-watch.sh` reports a difference.

| Source | The signal | Why this signal |
| --- | --- | --- |
| [Scorecard checks](../raw/ossf-scorecard-checks.md) | The set of check names and risk levels | The file's last five commits span a month and mostly do not change which checks exist, so the last commit would fire most weeks |
| [OpenSSF Baseline](../raw/ossf-security-baseline-releases.md) | The newest release tag | It publishes tagged releases, though only one release exists so far |
| [Best Practices criteria](../raw/ossf-best-practices-criteria.md) | The newest commit under `criteria/` | It has no versioned releases, only SBOM artefacts that would fire a release watcher on noise, and the directory changes every month or two |
| [REUSE specification](../raw/reuse-spec-changelog.md) | The newest released changelog heading | There are no releases or tags, and the old redirect is gone |

To review a change: read it, update `blueprint/` if the standard should follow, then run `bin/upstream-watch.sh --accept NAME` in the same pull request. Never accept to silence the report.

## Open questions

- The first recorded values are what each source said on the day the watcher was added. They are a starting point and not proof that the standard was checked against them.
- **The Scorecard signal has a blind spot.** A check's behaviour can change without its name or risk level changing: on 2026-10-28 GitHub Actions pinned to immutable releases began to count as pinned, and the fingerprint would not have fired. The Scorecard release feed is a complementary signal that is not watched yet.
- **The issue path is proven, the schedule is not.** Nothing has been stale, so the watchers never had a finding to report. On 2026-11-25 a manual run of `freshness.yml` with `probe` on opened a throwaway issue through the same `bin/lib/upsert-issue.sh` call, with its labels and the Gap type, found it again as unchanged and closed it ([the run](../raw/freshness-probe-observation.md)). The first attempt opened a second issue, because a list 5 seconds after a create did not show the first one, so the probe now waits for it. The path that rewrites a body after a change was not run. `freshness.yml` had no run at all before that, and its 2026-11-23 schedule did not fire: the 2026-11-30 schedule is the next check.
- A Baseline release can trigger two sources at once, which is accepted noise.
