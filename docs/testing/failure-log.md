# Test Failure Evidence Log

For two weeks starting 2026-11-20, log every test failure you fix during development or review as either:

- **caught regression**: the test failed because production behavior actually broke.
- **change detector**: production behavior was right and the test only failed because it asserted internal implementation details (call counts, mock order, exact DOM/CSS snapshots, or mirrored private code).

At the end of the two weeks, delete every test file whose failures were purely change detectors and keep the ban on those patterns in `AGENTS.md`.

**Never delete tests for authorization, privacy, migrations, or concurrency.**

| Date       | Test file                                                              | Kind (`caught regression` / `change detector`) | PR / Commit                                                | Notes                                                                                                                                                                                                                                                  |
| ---------- | ---------------------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-11-21 | `packages/runtime-client/src/runner.test.ts`                           | `caught regression`                            | `refactor/code-quality-audit`                              | `run-driver.close()` cancelled live durable runs instead of letting `backends.close()` shut down the runtime cleanly, breaking runner-restart resumption across 3 tests.                                                                               |
| 2026-11-22 | `e2e/layout.spec.ts`                                                   | `change detector`                              | `#465` (`feat/git-center`)                                 | Hardcoded 3 `Tab` presses from the Aven rail logo to `Bot` broke when the Git Center destination was added to the rail; updated to tab through rail links until `Bot` is focused.                                                                      |
| 2026-11-24 | `packages/runtime-client/src/git/host-git.test.ts`                     | `caught regression`                            | `fix/thread-diff-seed-index-mtime`                         | `seedIndex` in `thread-diff.ts` wrote the copied scratch index with a fresh mtime instead of preserving `.git/index`'s mtime, defeating Git's racy-git check for same-size edits made in the same filesystem timestamp tick.                           |
| 2026-11-24 | `packages/runtime-client/src/runs/agent-{claude,codex}-parity.test.ts` | `change detector`                              | `#499` (`fix/hosted-question-answers-and-tool-projection`) | Asserted the legacy plain-text `"color: red"` string for hosted `ask_user` answers after `answered()` was switched to Native-compatible JSON (`{"answers":[...]}`); updated to assert the structured `tool_end` JSON output and `tool-result` message. |
