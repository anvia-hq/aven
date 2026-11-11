---
name: setup-actions
description: Set up this repository's actions, the shortcuts shown beside Ship (run the tests, the typecheck, the linter, or hand the agent a task), by writing .aven/actions.yml from the repository's own scripts. Use when the user asks for actions or shortcuts, to run tests or checks from a button, or to add, change or remove one.
---

# Setting up actions

An **action** is a shortcut the person starts from the thread's **Actions** button, next to Ship. A person can star an action to make it a button of its own. `.aven/actions.yml` in the repository lists them. There are two kinds:

- **`run`**: a shell command that runs in the thread's sandbox, in `/workspace`, with the project's environment variables. It is not a run of the agent: it costs nothing, and can be started while the agent works. It appears under **Background tasks** with its output and exit code. When it exits with an error the person can press **Ask agent to fix**, which sends you the command, its exit code and the end of its output.
- **`prompt`**: a message sent to the agent as if the person had typed it, for work that needs judgment ("fix what the linter reports and commit"). It is off while the agent is working.

## The file

```yaml
actions:
  - name: Test
    run: bun test
  - name: Typecheck
    run: bun run typecheck
  - name: Fix lint
    prompt: Run the linter, fix what it reports, run it again, and commit the fixes.
```

Limits, all checked when the file is read (a file that breaks one shows no actions and a note saying why):

- `actions` is a list of at most **12**.
- Each has a `name` (1 to 40 characters, **unique**) and **exactly one** of `run` (up to 2,000 characters) or `prompt` (up to 10,000). No other keys.
- The file must be valid YAML. Quote a `run` that contains `: ` or starts with a special character, or write it as a block (`run: |`).

## 1. Learn what the repository can run

Read before asking:

- `package.json` scripts, a `Makefile`, `justfile`, `Taskfile`, `pyproject.toml`, `Cargo.toml`, `go.mod`: what the test, typecheck, lint, format and build commands are, and the package manager that is used (use its commands, never another's);
- `.github/workflows`: the checks CI runs, which are the ones worth a button;
- `AGENTS.md`, `CONTRIBUTING`, the README: how the team says to check a change;
- What the machine has: an action runs on the runner's own machine, so a command that needs a tool or a service the machine lacks should not be an action.

Then ask the user, in one message with your proposal so they can confirm or edit it: which actions to have, what each is called, and whether any should be a `prompt` and not a command. Offer the usual ones the repository supports (Test, Typecheck, Lint, Format, Build) and a prompt or two it would suit (fix lint, update the changelog, review my changes). Do not add an action nobody asked for.

## 2. Write `.aven/actions.yml`

- **Names are short and say the outcome**: `Test`, `Typecheck`, `Lint`, not `Run the unit test suite`. The first words show on a button.
- **A `run` must finish and be non-interactive.** It has no input, so no prompts and no watch mode (`vitest run`, not `vitest`). A command that keeps running, such as a dev server, works but stays under Background tasks until it is stopped; prefer commands that end.
- **Make a failure a non-zero exit.** The button shows success or failure by the exit code; do not end a command with `|| true`.
- **Chain with `&&`** when one action is several steps (`bun install && bun test`); a long chain is better as a script in the repository that the action calls.
- **No secrets** in the file: it is committed. A command reads what it needs from the project's environment variables.
- A **`prompt`** is written as instructions to an agent, with the commands it should use, what to do when something fails, and whether to commit.
- Keep to the actions the repository really has. Verify each `run` by running it once here and reading its result, and tell the user if one fails.

## 3. Tell the user

- The file is read from the thread's workspace, so **Actions** shows in this thread now (after the next run starts or ends, or a reload); **commit it** so every thread has it.
- To change or remove an action, edit and commit the file; there is nothing to save anywhere else. Starring an action is a choice of the person's own browser.
- A run action started from the button shows under **Background tasks**.

Do not commit or push anything yourself unless the user asks.
