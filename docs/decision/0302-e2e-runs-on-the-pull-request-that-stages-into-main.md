# 0302: e2e runs on the pull request that stages into main, and main takes only staging

Date: 2026-11-15

## Decision

- A `staging` branch lives on the remote (there is no local one) and is the repository's default branch, so a new pull request asks for `staging` unless it is told otherwise: work reaches it through pull requests, and `staging` reaches `main` through one pull request of its own.
- The `protect-main` ruleset names `refs/heads/main` instead of the default branch, so moving the default to `staging` left `main` protected in the same way (no deletion, no non-fast-forward, a pull request required). `staging` itself is not protected: a branch that collects work does not need the rule.
- `e2e` in `.github/workflows/ci.yml` runs only on that pull request: `github.base_ref == 'main' && github.head_ref == 'staging'`. Typecheck, lint, format and the unit tests still run on every pull request and on a push to `main`.
- `staging-only`, in a workflow of its own (`.github/workflows/staging-only.yml`), fails a pull request into `main` whose head is any branch but `staging`. It has no checkout, takes `edited` among its triggers, and passes everywhere else, so it is reported on every run and can be required by the `protect-main` ruleset without a pull request waiting on a check that never starts.

  It is a workflow of its own rather than a job of `ci.yml` because of `edited`: GitHub runs `pull_request` workflows again when a pull request's base branch changes only if the workflow takes `edited`, and `ci.yml` taking it would run the e2e suite again for a change to a pull request's description. The guard is three seconds, so it can be re-evaluated on every edit while the suite waits for code.

  Base edits are the reason for the trigger at all: a pull request opened against `staging` gets its guard, and retargeting it to `main` would otherwise keep the green check of the run against `staging` on the head commit, which is the rule bypassed.

- `install.sh` keeps its `raw.githubusercontent.com/anvia-hq/aven/main/install.sh` address: an install follows a release of `main`, never what staging is collecting.

## Why

The e2e suite is the long part of a pull request's checks: three shards, each installing Chromium and a Postgres service, for a suite that mostly proves the platform against the fake runner. Running it on every pull request spent that time on branches that were about to change again.

Staging collects the work first, so the suite runs once, on the code that is about to be `main`. A feature branch's pull request keeps the fast checks, which is where a typecheck or a unit test failure is worth catching.

GitHub cannot limit a pull request's head branch by a rule: the `protect-main` ruleset requires a pull request and forbids deletion and a non-fast-forward push, and `required_status_checks` can only require a check to pass. So the branch rule is a check (`staging-only`) that a ruleset makes required.

A default branch of `staging` is what makes the flow self-explaining: the composer of a pull request points at the branch work collects on, and `main` is the deliberate step a person takes once the suite has run.

## The required checks

The `protect-main` ruleset requires `main only takes staging` and `e2e 1/3`, `e2e 2/3` and `e2e 3/3`. Those three are the names a shard reports while it runs; a job its `if` skips reports under the unexpanded `e2e ${{ matrix.shard }}/3` instead, so a pull request into `main` that skips the suite leaves the required names unreported and cannot merge. That is the point — the suite is a condition of moving `main` — but it means the `e2e` condition and the ruleset are one setting in two places: changing the condition without editing the ruleset stops `main` from taking merges.

## What this asks of a change

A fix that must reach `main` without waiting for staging goes through staging too, or the ruleset is edited for it deliberately. A release is tagged from `main` as `docs/rules/0005-releasing.md` says; the tag is not a branch push and no rule here touches it.
