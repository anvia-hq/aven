---
name: setup-ship
description: Set up or update how this repository's changes are shipped, so the Ship button follows the team's workflow in .aven/ship.md. Reads an existing .aven/ship.md first so updates stay targeted instead of rewriting conventions from scratch. Use when the user asks to set up shipping or change what Ship does.
---

# Setting up shipping

The **Ship** button sends the agent a prompt and lets it do the work in the thread, with `git` and `gh` signed in as the user. Ship works without a repository file using Aven's default: commit, rebase onto the default branch, run checks, push the branch, open a **draft** pull request with `gh pr create --draft`, and report its URL. This skill creates or updates `.aven/ship.md` so Ship follows the team's pull request template, checks, merge rules, and review workflow.

`.aven/ship.md` is sent as-is, followed by one line naming the thread's branch and the default branch. It has no template variables and may be up to 10,000 characters. Write it as concrete instructions to an agent, in the second person, with exact commands.

## 0. Check for an existing `.aven/ship.md` first

Before re-investigating the repository, check if `.aven/ship.md` already exists.

**If `.aven/ship.md` already exists:**

1. Read it in full. **Do not overwrite it from scratch.**
2. If the user asked for a specific change (for example "open ready PRs instead of drafts" or "add `bun run test:e2e`"), make **only that targeted edit**, preserving the rest of the file, and show the diff.
3. If the user invoked `/setup-ship` without saying what to change (for example via **Change how Ship works**), briefly summarize what `.aven/ship.md` currently does, note anything that looks out of date against the repository's current CI/templates/default branch, and **ask what they want changed** before editing the file.

Only go through steps 1–2 in full when `.aven/ship.md` does not exist yet (or the user explicitly asked to rebuild it).

## 1. Learn how the team ships

Work it out from the repository before asking anything. Read:

- `CONTRIBUTING`, `AGENTS.md`, `CLAUDE.md`, `README`: branch names, commit style, sign-off (`-s`), review rules;
- `.github/pull_request_template.md` or `.github/PULL_REQUEST_TEMPLATE/`: expected PR body;
- `.github/workflows`: the exact checks CI runs so the agent runs the same ones before pushing;
- `.github/CODEOWNERS`, `.github/labeler.yml`, `release-please` or `changesets`, merge queue or auto-merge config;
- `git log --oneline -30` and `gh pr list --state merged --limit 10 --json title,baseRefName,labels,reviewDecision,mergedBy`: real commit style, target branch, labels, and conventions;
- scripts named `ship`, `release`, `prepare`, `verify` in `package.json`, `Makefile`, or `justfile`.

Settle each of these from evidence and note where it came from:

- target branch and branch naming;
- commit message style (and whether DCO sign-off `-s` is used);
- exact check commands to run before pushing;
- pull request description shape (template or recent merged PRs);
- draft vs. ready, reviewers, labels, issue linking;
- whether the agent ever merges or turns on auto-merge (default: never).

Do not ask about anything the repository already answers. Where it is silent, use Aven's defaults (draft PR into the default branch, the project's own checks, no merge by the agent) and say you did.

## 2. Write the draft `.aven/ship.md`

List the steps in order with exact commands. Keep what Aven's default gets right (focused commits, update from default branch, never force-push the default branch, report the PR URL) and customize what differs:

```markdown
Ship this thread's work.

1. Commit what belongs to the work. Commit messages follow Conventional Commits (`feat:`, `fix:`, ...). Never commit `.env` files or build output.
2. Rebase onto the default branch: `git fetch origin main && git rebase origin/main`.
3. Run the checks CI runs: `bun run typecheck && bun run lint && bun test`. Fix what you broke; if something fails that you cannot fix, stop and tell me.
4. Push the branch with `git push -u origin HEAD`. Never force-push `main`.
5. Open a pull request against `develop` with `gh pr create --draft --base develop`, filling in `.github/pull_request_template.md` and adding the `needs-review` label. If a PR is already open for this branch, the push updates it.
6. Do not merge. Tell me the pull request's URL.
```

Rules:

- **Commands, not wishes.** "Run the checks" is weak; `bun run typecheck && bun test` is executable.
- **Say what to do on failure.** For each check or step, say whether to fix and retry, stop and report, or skip.
- **Name non-default base branches explicitly** with `--base`.
- **Let Aven append thread context.** Aven automatically appends the thread's branch, existing pull requests, and how to branch off default for a new PR — do not duplicate that in `.aven/ship.md`.
- **Stay within what the agent can actually run.** The agent has `git`, `gh`, the project's local tools (and headless Playwright if installed), and whatever MCP servers are configured — do not assume GUI browsers or external tools that are not present.
- **No secrets.** The file is committed.
- **Keep it concise** (well under 10,000 characters): shorter prompts are followed more reliably.

## 3. Show it and ask only what is left

Show the draft with a one-line note of evidence for each choice (_"Targets `develop`: your last 10 merged PRs did"_). Ask at most three questions, and only for things the repository did not settle:

- **Proof for UI/behavior changes:** should PRs include check summaries, screenshots, or recordings (only offer Playwright screenshots/video if Playwright is actually installed, and ask whether proof files should be committed in a folder like `.aven/proof/` or kept out of git)?
- **Hard guardrails** not already stated in the repository (e.g., never edit lockfiles by hand, never ship with failing tests).
- **Contradictions** in the repository (e.g., two conflicting PR templates), with your recommendation.

If nothing is ambiguous, ask nothing — show the draft and its evidence.

## 4. Refine and verify

Adjust `.aven/ship.md` from their answers, and offer to test it by pressing **Ship** on a small change.

## 5. Tell the user

- `.aven/ship.md` is read from the workspace whenever **Ship** is pressed, so it takes effect in this thread immediately; **commit it** so every thread has it.
- To adjust it later, edit `.aven/ship.md` and commit (or run `/setup-ship` with what to change).
- Delete `.aven/ship.md` to go back to Aven's default.

Do not commit or push anything yourself unless the user asks.
