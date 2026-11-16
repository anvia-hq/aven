# 0314: There is no staging branch

Date: 2026-11-16

Status: accepted. Supersedes 0302 (e2e on the staging to main pull request, `staging-only`) and 0312 (Hammer skips that pull request).

## Decision

- `main` is the repository's default branch again, and the `staging` branch is deleted. A pull request asks for `main`, and work reaches it directly.
- `e2e` in `.github/workflows/ci.yml` runs on every pull request, with typecheck, lint, format and the unit tests.
- `.github/workflows/staging-only.yml` is deleted, and `main only takes staging` is no longer a required check of the `protect-main` ruleset. The ruleset keeps the pull request rule, the deletion and non-fast-forward rules, and the three `e2e` shard checks.
- Hammer reviews every pull request: the `if` on its `review` job is gone.

## Why

Collecting work on `staging` added a second pull request and a branch to keep in step for every release, and it left work on `staging` unreviewed and untested until the release pull request. Running the full checks on each pull request puts a failure on the change that caused it.

## Consequences

- Every pull request pays for the three e2e shards, the cost 0302 avoided.
- The `e2e` condition and the required checks are still one setting in two places (0302): the shards are required, so they must keep running on every pull request into `main`.
