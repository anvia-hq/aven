---
name: setup-ship
description: Set up how this repository's changes are shipped, so the Ship button does what the team does, by writing .aven/ship.md from the repository's own conventions. Use when the user asks to set up shipping, to change what Ship does.
---

# Setting up shipping

The **Ship** button sends the agent a prompt and lets it do the work in the thread, with `git` and `gh` signed in as the user. Ship works without a repository file: the prompt is then Aven's default: commit, rebase onto the default branch, run the checks, push the branch, open a **draft** pull request with `gh pr create --draft`, and report its URL. This skill writes the repository's own version, `.aven/ship.md`, so Ship follows the team's way: its pull request template, its checks, its merge rules, its release steps.

`.aven/ship.md` is sent as it is, followed by one line saying which branch the thread is on and which is the default. It has no template variables and may be up to 10,000 characters. Write it as instructions to an agent, in the second person, with concrete commands.

## 1. Learn how the team ships

Work it out from the repository before you ask anything. Read:

- `CONTRIBUTING`, `AGENTS.md`, `CLAUDE.md`, the README: branch names, commit style, review rules;
- `.github/pull_request_template.md` or `.github/PULL_REQUEST_TEMPLATE/`: the description the team expects;
- `.github/workflows`: the checks CI runs, so the agent can run the same ones before pushing;
- `.github/CODEOWNERS`, `.github/labeler.yml`, `release-please` or `changesets` files, a merge queue or `auto-merge` mentioned anywhere;
- `git log --oneline -30` and `gh pr list --state merged --limit 10 --json title,baseRefName,labels,reviewDecision,mergedBy`: the real commit style, which branch pull requests target, whether they are squashed, who reviews, which labels they carry;
- scripts named `ship`, `release`, `prepare`, `verify` in `package.json`, a `Makefile` or a `justfile`.

Settle each of these from what you found and note where it came from, so the person can see why:

- the branch pull requests target, and the branch naming;
- commit message style;
- the checks to run before pushing, as exact commands;
- the pull request description (the template, or the shape recent merged pull requests have);
- draft or ready, reviewers, labels, a ticket to link;
- squash, rebase or merge, and whether anyone turns on auto-merge.

Do not ask about anything the repository answers. Where it is silent or contradicts itself, use Aven's default (draft pull request into the default branch, the project's own checks, no merge by the agent) and say you did.

## 2. Write the draft `.aven/ship.md`

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
- **Aven adds the rest.** After the file it appends where the thread is, its pull requests so far and, for a ship that is a new pull request, how to branch off the default branch (a branch of the thread starts with its own name, `aven/<id>-<slug>`); do not repeat that, and write the file for the first pull request.
- **Nothing the agent cannot do.** It acts as the user with `gh` and `git`, and has a desktop browser in its sandbox but no access to other systems.
- **No secrets.** The file is committed.
- Under 10,000 characters, and shorter is better: a long prompt is followed less carefully.

## 3. Show it and ask only what is left

Show the draft you wrote, with one short line for each choice that came from evidence ("Targets `develop`: your last 10 pull requests did"). Ask at most three questions, and only about what you could not settle:

- **Proof.** Should a pull request include proof that the change works: the output of the checks, screenshots of changed screens, a recording of the flow (Playwright with video, or `ffmpeg` on the desktop), before and after images? Ask which changes need it. `gh` cannot attach files to a pull request, so proof files go in the branch (a folder such as `.aven/proof/`, removed before merging or not), with the description linking to them. Check first that Playwright and its browsers are on the machine; if they are not, say so instead of promising it.
- **Anything that must not happen**, only if the repository gives no hint (pushing to the default branch, hand-editing a lockfile, shipping with failing tests).
- **A choice the repository contradicts itself on**, such as two pull request templates, with your pick.

If nothing is left to ask, ask nothing: show the draft and say what you based it on.

## 4. Check it with the user

Adjust the file from their answers, then offer to press **Ship** on a thread with a small change to try it, and adjust the file from what happens.

## 5. Tell the user

- `.aven/ship.md` is read from the repository's workspace each time Ship is pressed, so it works in this thread now; **commit it** so every thread has it.
- To change what Ship does, edit the file and commit it: there is nothing to save anywhere else.
- If they ever want Aven's default back, delete the file.

Do not commit or push anything yourself unless the user asks.
