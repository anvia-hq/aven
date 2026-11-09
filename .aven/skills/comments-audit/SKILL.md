---
name: comments-audit
description: Check that a change adds no comments to TypeScript, per decision 0149. Use after writing or changing .ts or .tsx files, when reviewing a diff, and when you feel like explaining a line with a comment.
---

# Comments audit

Decision 0149 (`docs/decision/0149-no-comments-in-typescript-code.md`): **TypeScript (`.ts`, `.tsx`) has no comments.** Not inline, not above a line, not a doc block. A comment says what code does, which the names, types and tests already do, and it drifts from the code beside it. **Why** a choice was made goes in a decision record, in `docs/decision/`.

What stays:

- tool directives that a tool reads: `@ts-expect-error`, `@ts-nocheck`, `oxlint-disable`, `eslint-disable`, `/// <reference>` and shebangs;
- comments in files this rule does not cover: CSS, shell, `.mjs`, docs and Swift.

## 1. Find them

From the repository root, on the files you changed:

```sh
bun .aven/skills/comments-audit/scripts/find-comments.ts $(git diff --name-only main...HEAD; git diff --name-only; git ls-files --others --exclude-standard)
```

It reads the comments between the tokens of the parsed file, so text inside strings, regular expressions, templates and JSX is not mistaken for a comment, and it skips the directives above. It prints `file:line: comment` and exits 1 when there are any. Leave out generated files (`apps/platform/src/routeTree.gen.ts`) and the vendored `apps/platform/src/components/`.

## 2. Remove each one the right way

For every comment it finds, decide which it is:

- **It says what the code does.** Delete it. If the code is not clear without it, rename the variable or function, extract a well-named function, or add a type, until it is.
- **It says why** (a workaround, a limit, a surprising order, a security reason). Delete the comment and put the reason in a decision record: `docs/decision/<next number>-<name>.md` with `Status:`, `Context` and `Decision`, in the same pull request (`docs/README.md` has the format and numbering). When an existing decision already covers it, say its number in the pull request description. For a bug in a library, `docs/bugs/`.
- **It marks unfinished work** (`TODO`, `FIXME`). Finish it, or write it as a task for the person; do not leave it in the code.
- **An empty `catch {}`** is read as "ignored on purpose": do not explain it, and make sure it really is meant.
- **`any`.** Do not comment it: say why in the pull request.

A test's name is its explanation: write what the test shows as a sentence in `test("...")`.

## 3. Check

Run the script again: it must say `no comments`. Then run `bun run lint` and `bun run format`.

Say in your report which decision records you wrote or cited for the reasons you took out of the code.
