# Hammer reviews every pull request but the one from staging to main

Status: superseded by 0314 (there is no `staging` branch, so Hammer reviews every pull request). Decided 2026-11-16.

## Decision

The `review` job of `.github/workflows/hammer.yml` is skipped when the pull request comes from
`staging` into `main`: `if: github.head_ref != 'staging' || github.base_ref != 'main'`. Every other
pull request still gets a Hammer review, on open, on every push, on reopen and on ready for review.

`review` is not one of the checks the `protect-main` ruleset requires — that ruleset requires
`main only takes staging` and the three `e2e` shards — so a skipped run leaves nothing waiting on
the release pull request.

## Why

The pull request from `staging` into `main` is not a change: it is everything staging has collected,
and each commit in it was reviewed by Hammer in the pull request it arrived in. Reviewing it again
re-reads a diff of the whole release in one go, against code that was already reviewed, fixed or
accepted in its own pull request; the findings land on a pull request whose author is merging, not
editing, and the run costs a full review of the release on every push to staging.

The suite that does run there is the one that cannot run anywhere else: `e2e` needs the production
build of the platform and its own database, so it waits for the pull request that stages into `main`
(decision 0302). Hammer needs nothing a feature pull request does not already give it.

## Consequences

- A release pull request shows no Hammer review. What it shows is the reviews of its parts, which is
  where a person can still act on them.
- A commit pushed straight to `staging` gets no review of its own either, and now no review at all
  on its way to `main`. `staging` is not protected, and that was already true of the pull request's
  own checks: this makes the gap visible rather than adding it.
- Asking Hammer for a review of a release means opening a pull request from the branch it is on, or
  running the action by hand: the workflow takes no `workflow_dispatch` trigger.
- The condition and the ruleset are two settings that a person can edit apart. If `review` ever
  becomes a required check, a skipped run there turns into a pull request that cannot merge, which
  is what decision 0302 says about `e2e` and its own `if`.
