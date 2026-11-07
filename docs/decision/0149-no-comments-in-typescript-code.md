# No comments in TypeScript code

Status: accepted.

## Context

The code carried about 7,200 lines of comments across 858 files: what a function does, why a branch exists, which decision a line follows. They drift from the code they sit beside, they repeat what the names and types already say, and the reasons that matter already have a home in `docs/decision/` and `docs/bugs/`.

## Decision

- **TypeScript (`.ts`, `.tsx`) has no comments.** They were removed with the TypeScript parser, not a pattern, so text inside strings, regular expressions and globs was not touched.
- **Directives stay**: `@ts-nocheck`, `@ts-expect-error`, `oxlint-disable`, `eslint-disable`, `/// <reference>` and shebangs, because tools read them.
- **Why goes in a decision record**, and what goes in names, types and tests.
- **`any`**: the rule that asked for a comment on each one is now a note in the pull request.
- **Not covered**: CSS, shell, `.mjs`, docs and the Swift client keep theirs.

## Consequences

- Lines such as "Not up yet." beside an empty `catch` are gone; an empty `catch {}` is read as "ignored on purpose".
- Old decisions that point at a file for the reason behind a line still hold, but the line no longer says so; `git log -S` and the decision's number find it.
- New code is held to the same rule in review.
