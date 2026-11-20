# The e2e suite runs before the push that makes a branch

Status: accepted. Supersedes part of decision 0316 (which kept the e2e suite out of the hooks).

## Context

Decision 0316 put typecheck, lint and `format:check` in a commit hook and said the tests stay in CI. It had tried a pre-push hook for the unit tests and dropped it: the suite shares the developer's database, so it failed on `main` itself over an unmigrated database and rows left behind by other tests, and a hook that blocks a push for reasons outside the change is skipped with `--no-verify`, which protects nothing.

The e2e suite is not that suite. It makes a database of its own for every run (`aven_<random>_e2e` in `playwright.config.ts`, recreated by `e2e/setup-db.ts` and refused unless the name ends in `_e2e`), its own ports (`8100`, `5174`, `8101`, `8102`), its own runtime home in a temporary folder, and a fake GitHub and a fake model, and it builds the platform instead of reading a dev server. Nothing of it reads `aven` or the developer's `.env` beyond the database's base URL. The reason 0316 gave for refusing a hook does not hold here.

What went wrong without it: a pull request opened with e2e broken, with the failure found minutes later in CI and a push spent on it. The moment before a branch appears on the remote is the only moment the e2e suite can refuse the pull request, and it is the moment the person still has the change in their head.

## Decision

- `.husky/pre-push` runs `bun run test:e2e`, the suite `ci.yml` runs, when the push creates a branch on the remote: an input line whose remote sha is all zeros and whose local ref is under `refs/heads/`. That is the push a pull request is made from.
- A push that updates a branch already on the remote does not run it, so a fix after a review costs nothing, and neither does pushing a tag, deleting a branch, or pushing to a branch whose ref is not a local one. The hook says what it skipped and how to run it anyway.
- `AVEN_FORCE_E2E=1` runs it on any push, and `AVEN_SKIP_E2E=1` skips it. `git push --no-verify` skips every hook, as it always does.
- It runs the suite once, without `--shard`. CI's three shards divide the same tests across three machines; locally one run covers all of them and builds the platform once instead of three times. `PLAYWRIGHT_*` and `E2E_*` still move the workers, the ports and the database.

## Consequences

- A push that creates a branch now takes as long as the e2e suite does. A push that fixes a branch does not.
- The hook needs the same things the suite needs: Postgres reachable at `postgres://localhost:5432`, Playwright's chromium (`bunx playwright install chromium`), and the ports free. A machine that has never run the suite fails the hook on that, not on the change, which `AVEN_SKIP_E2E=1` answers.
- The unit tests stay out of the hooks as 0316 decided: they still share the developer's database.
- Hooks arrive with `bun install`; a clone that has not run it has none, and CI stays the authority on both suites.
