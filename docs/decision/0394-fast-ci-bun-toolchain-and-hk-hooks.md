# Fast CI on Bun's native toolchain and hk local hooks

Status: accepted. Supersedes 0316 and 0391. Decided 2026-11-20.

## Context

An audit of 150 CI runs showed median pull-request wall time at 436s (7m 16s) and p95 at 747s (12m 27s):

- `playwright install-deps chromium` spiked over 60s in 78.5% of runs (up to 499s) while installing zero missing Chromium libraries on `ubuntu-24.04`.
- `services: postgres:17` added 14–17s of Docker pull and startup overhead to four jobs per run.
- `tsc` took 45s p50 / 65s p95.
- Unit tests ran 458 files serially in one process (95s p50 / 114s p95).
- E2E ran 243 tests on 2 workers per shard with `retries: 1` (hiding flakes).
- Locally, `.husky/pre-commit` ran full-repo typecheck, lint and format (~15s), and `.husky/pre-push` ran the entire E2E suite before creating a branch (minutes).

## Decision

- **Bun native toolchain**: `bun check` (TypeScript 7), `bun lint` (reading `.oxlintrc.json` with `suspicious` and `perf` rules enabled, 157 rules total), and `bun fmt` replace standalone `typescript`, `oxlint` and `oxfmt`. CI pins the exact immutable canary (`1.4.5-canary.20261120.1`) until those subcommands ship in a stable Bun release.
- **No hidden failures**: `playwright.config.ts` sets `retries: 0` and runs 4 workers per shard matching 4-core runners. Flaky unit tests are fixed at the root cause rather than retried.
- **Parallel isolated shards with completeness proofs**: Unit tests run with `bun test --parallel=4 --isolate`, per-worker throwaway Postgres databases cloned from `aven_template` via `tooling/ci/test-db-preload.ts`, timing-balanced across 2 shards. E2E specs are balanced across 3 shards by recorded timings (`tooling/ci/e2e-shards.ts`). On `main` and `merge_group`, completeness jobs prove the shards together ran every test file with zero gaps or duplicates and update the timing caches.
- **PR selection + merge queue safety**: Pull requests run only the unit tests (`bun test --changed`) and E2E specs reachable from the diff (`tooling/ci/select-tests.ts`), falling back to the full suite whenever any global input or unmapped shared file changes. The full suite runs on `merge_group` and `main` before code lands.
- **Budgets enforced in CI**: `ci.yml` fails if `lint > 1s`, `format > 1s`, `typecheck > 5s`, `check running > 35s`, warm `check setup > 25s` (tighten to `15s` on baked/Blacksmith runners), narrow unit shard `> 30s`, or narrow E2E shard `> 35s`.
- **`hk` replaces `husky`**: `hk.pkl` runs `bun fmt` and `bun lint` on staged files in `pre-commit` (<1s) and runs `bun check`, `bun lint`, `bun fmt --check` and `bun test --changed=origin/main` in parallel in `pre-push` (<9s). `husky` and `.husky/` are removed.

## Consequences

- Local hooks stay under 9 seconds so developers and agents do not bypass them.
- Narrow pull requests get CI feedback in under 1 minute, while `merge_group` guarantees the full un-narrowed suite runs before anything reaches `main`.
- Contributors install `hk` once (`brew install hk && hk install`); `package.json`'s `prepare` script runs `hk install || true` on `bun install`.
