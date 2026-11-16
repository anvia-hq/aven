# 0316: Husky runs the fast CI checks before a commit

Date: 2026-11-16

Status: accepted.

## Decision

- `husky` is a root dev dependency, installed by `prepare` (`husky || true`, so an image built with `--production` or without `.git` does not fail).
- `.husky/pre-commit` runs `bun run typecheck`, `bun run lint` and `bun run format:check`: the `check` job of `ci.yml`. It takes about fifteen seconds.
- The unit tests and the e2e suite are not hooks. They stay in CI; `bun run test` runs the unit tests by hand.

## Why

A failure caught by CI costs a push and a wait, so the checks that are fast and depend on nothing but the code run before every commit.

A pre-push hook for the unit tests was tried and dropped. The suite takes about 100 seconds and shares the developer's database, and on a machine whose database or `.env` is a little behind it failed on `main` itself: 69 failures from an unmigrated database, then two that remained (a sandbox cancel test that timed out and a bots test that reads shared rows). A hook that blocks a push for reasons outside the change gets skipped with `--no-verify`, and a skipped hook protects nothing.

## Consequences

- A commit with a type, lint or format error is refused locally. `git commit --no-verify` skips it and CI still catches it.
- A failing unit test is found in CI, not before the push.
- Hooks are installed by `bun install`; a clone that has not run it has none.
- If the unit tests become independent of the developer's database, a pre-push hook can return.
