---
name: setup-ship
description: Set up how this repository's changes are shipped, so the Ship button does what the team does, by writing .aven/ship.md from the repository's own conventions. Use when the user asks to set up shipping, to change what Ship does, or after /setup-env has finished.
---

# Setting up shipping

The **Ship** button sends the agent a prompt and lets it do the work in the thread, with `git` and `gh` signed in as the user. Without a repository file, the prompt is Aven's default: commit, rebase onto the default branch, run the checks, push the branch, open a **draft** pull request with `gh pr create --draft`, and report its URL. This skill writes the repository's own version, `.aven/ship.md`, so Ship follows the team's way: its pull request template, its checks, its merge rules, its release steps.

`.aven/ship.md` is sent as it is, followed by one line saying which branch the thread is on and which is the default. It has no template variables and may be up to 10,000 characters. Write it as instructions to an agent, in the second person, with concrete commands.

## 1. Learn how the team ships

Read what exists before asking anything:

- `CONTRIBUTING`, `AGENTS.md`, `CLAUDE.md`, the README: branch names, commit style, review rules;
- `.github/pull_request_template.md` or `.github/PULL_REQUEST_TEMPLATE/`: the pull request description the team expects;
- `.github/workflows`: the checks CI runs, so the agent can run the same ones before pushing;
- `.github/CODEOWNERS`, `.github/labeler.yml`, `release-please` or `changesets` files, a merge queue or `auto-merge` mentioned anywhere;
- `git log --oneline -30` and `gh pr list --state merged --limit 10`: the real commit style (conventional commits? ticket numbers?), whether pull requests are squashed, who reviews;
- scripts named `ship`, `release`, `prepare`, `verify` in `package.json`, a `Makefile` or a `justfile`.

Then ask the user, in one message, with your guess for each so they can just confirm. Skip a question only when the repository answers it for certain:

**Where the work goes**

- Which branch do pull requests target: the default branch, or another one (a `develop` or release branch)? Does it depend on the kind of change?
- Branch names: keep the thread's own branch, or follow a pattern (`feat/<topic>`, a ticket number)?
- Draft pull request or ready for review?
- Reviewers, labels, a ticket or issue to link?

**What the pull request holds**

- What should the description say: a summary of the change, why, how it was tested, risks, follow-ups? Use the repository's template if there is one.
- Should it include **proof** that the change works? Offer the options and let them pick any: command output of the checks and tests, screenshots of the changed screens, a screen recording of the flow (a Playwright test run with video on, or a recording of the desktop with `ffmpeg`), before and after images. Ask which changes need proof (every UI change? only when asked?) and where the files go: committed to the branch in a folder such as `.aven/proof/` (and whether that folder should be removed before merging), or described in text only. `gh` cannot attach files to a pull request, so proof files must be in the branch, with the description linking to them.
- Is anything not allowed in the description (internal links, customer names)?

**How it is checked and merged**

- Which checks must pass locally before pushing?
- Squash, rebase or merge? Should the agent turn on auto-merge, or leave merging to people?
- Anything that must **not** happen (pushing to the default branch, touching a lockfile by hand, shipping with failing tests)?

Check what the proof needs before promising it: Playwright and its browsers are in the sandbox only if the project's `.aven/setup` installs them (`ffmpeg` and Chromium are in the sandbox image). If the user wants Playwright proof and the project lacks it, say so and suggest adding it to `/setup-env`.

## 2. Write `.aven/ship.md`

Say what to do in order, with the exact commands. Keep what the default prompt gets right (commit with clear messages, update from the default branch, never force-push the default branch, tell the user the URL) and replace what the repository does differently. A good shape:

```markdown
Ship this thread's work.

1. Commit what belongs to the work. Commit messages follow Conventional Commits (`feat:`, `fix:`, ...). Never commit .env files or build output.
2. Rebase onto the default branch: `git fetch origin main && git rebase origin/main`.
3. Run the checks CI runs: `bun run typecheck && bun run lint && bun test`. Fix what you broke; if something fails that you cannot fix, stop and tell me.
4. Push the branch with `git push -u origin HEAD`. Never force-push main.
5. Record proof for UI changes: run `bunx playwright test e2e/<spec> --video=on`, copy the videos and screenshots into `.aven/proof/`, commit and push them.
6. Open a pull request against `develop` with `gh pr create --draft --base develop`, filling in .github/pull_request_template.md and linking the proof files under "How it was tested". Label it `needs-review`. If one is already open for this branch, the push updates it.
7. Do not merge. Tell me the pull request's URL.
```

Rules:

- **Commands, not wishes.** "Run the checks" is weak; `bun run typecheck && bun test` is what the agent can run.
- **Say what to do when a step fails.** Stop and tell the user, or fix and retry, or skip: decide for each.
- **Name the base branch.** The prompt ends with a line naming the default branch; if pull requests go elsewhere, say so with `--base`.
- **Nothing the agent cannot do.** It acts as the user with `gh` and `git`, and has a desktop browser in its sandbox but no access to other systems.
- **No secrets.** The file is committed.
- Under 10,000 characters, and shorter is better: a long prompt is followed less carefully.

## 3. Check it with the user

Show them the file and ask if it matches how they ship. Offer to press **Ship** on a thread with a small change to try it, and adjust the file from what happens.

## 4. Tell the user

- `.aven/ship.md` is read from the repository's workspace each time Ship is pressed, so it works in this thread now; **commit it** so every thread has it.
- To change what Ship does, edit the file and commit it: there is nothing to save anywhere else.
- If they ever want Aven's default back, delete the file.

Do not commit or push anything yourself unless the user asks.
