# Branch protection — required ruleset for `main`

This document is the source of truth for the branch-protection ruleset that should be applied to `main` after `.github/workflows/ci.yml` lands and runs at least once on `main`. Branch protection cannot be configured via PR — it must be applied in repo settings by a human with admin rights.

> **Note on the CI workflow itself:** GitHub blocks pushes to `.github/workflows/*` from OAuth apps without the `workflow` scope, which the Devin git proxy does not currently hold for this repo. The CI workflow content lives in this PR's description and is attached as `ci.yml`. Add it to the repo via GitHub's web UI (Code → Add file → Create new file → path `.github/workflows/ci.yml`, paste contents) on `main` after merging this PR. Once GitHub records a successful run on `main`, the named status checks below become available to require.

## Why we wait until CI runs once on main

GitHub only knows about a workflow's status checks AFTER the workflow has completed at least one run on the branch you're protecting. Adding `backend (test + build)` to the required-checks list before `main` has produced a CI run will fail to save (the check name won't exist yet). Order:

1. Merge this PR (which adds `.github/workflows/ci.yml`).
2. CI runs once on the merge commit on `main` and produces named status checks: `backend (test + build)`, `frontend (build)`, `06_INTERFACES schema lock`, `archive scripts (test + typecheck)`.
3. Apply the ruleset below from repo Settings → Branches → "Add rule" (or the newer "Rulesets" UI).

## Required ruleset on `main`

### Status checks (staged rollout)

GitHub's protection UI only lets you require checks that have ALREADY run on `main`. The `archive scripts (test + typecheck)` job is conditional on `scripts/archive/` existing on the branch under test — it skips cleanly until PR #1 (daily-archive) lands on `main`. Until that happens, requiring it would block all merges with a check that never runs. Stage the ruleset:

**Phase 1 (apply immediately after the first CI run on `main`):**

- `CI / backend (test + build)`
- `CI / frontend (build)`
- `CI / 06_INTERFACES schema lock`

**Phase 2 (apply after PR #1 lands on `main` and `scripts/archive/` exists):**

- All Phase 1 checks
- `CI / archive scripts (test + typecheck)`

Mark the ruleset as "Require status checks to be up to date before merging" so a stale-base PR can't merge with green CI from before a `main` change.

> **Verify the exact check names before saving the ruleset.** GitHub displays them as `<workflow>/<job-display-name>` (e.g. `CI / backend (test + build)`). If you copy-paste names from this doc and they don't match the dropdown, the ruleset will save but the check will never gate — silent failure. Always pick from the dropdown that GitHub populates from prior runs.

### Pull-request requirements

- "Require a pull request before merging" — ON
- "Require approvals" — `1`
- "Dismiss stale pull request approvals when new commits are pushed" — ON
- "Require review from Code Owners" — OFF (no `CODEOWNERS` in this repo today; revisit when one lands)
- "Require conversation resolution before merging" — ON

### History + push protections

- "Require linear history" — ON (no merge commits on `main`; squash or rebase only)
- "Require signed commits" — OPTIONAL (turn ON if all maintainers have GPG/SSH signing set up; otherwise leave OFF for now to avoid blocking honest contributors)
- "Do not allow bypassing the above settings" — ON
- "Restrict who can push to matching branches" — ON; allowlist only the maintainer account(s)
- "Allow force pushes" — OFF
- "Allow deletions" — OFF

### Tag rules (optional, recommended after this PR)

When you start cutting tagged releases (e.g. `v1.0.0`), add a separate ruleset on tags matching `v*` requiring the same status checks to have passed on the tagged commit. Until then, no tag protection is needed.

## How to verify after applying

Open a throwaway test PR that intentionally breaks one CI job (e.g. add a failing test to `backend/src/services/__tests__/`). The merge button must be disabled with a clear "Required status checks not passing" reason. Close the test PR without merging.

## Auditing later

The protection ruleset itself is auditable in repo Settings → Branches → "View ruleset history". Whenever the ruleset changes, GitHub records who changed it and when. That audit trail satisfies the same "every change is evidenced" principle ConsoleLab applies to authority decisions.
