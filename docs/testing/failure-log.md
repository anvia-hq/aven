# Test Failure Evidence Log

For two weeks starting 2026-11-20, log every test failure you fix during development or review as either:

- **caught regression**: the test failed because production behavior actually broke.
- **change detector**: production behavior was right and the test only failed because it asserted internal implementation details (call counts, mock order, exact DOM/CSS snapshots, or mirrored private code).

At the end of the two weeks, delete every test file whose failures were purely change detectors and keep the ban on those patterns in `AGENTS.md`.

**Never delete tests for authorization, privacy, migrations, or concurrency.**

| Date | Test file | Kind (`caught regression` / `change detector`) | PR / Commit | Notes |
| ---- | --------- | ---------------------------------------------- | ----------- | ----- |
