# Shipping this thread's work

Ship this thread's work.

1. **Commit what belongs to the work, and nothing else.** Commit messages are one short imperative
   sentence in this repository's style — "Put the machine rows in a card, with a rule under it" —
   with no `feat:`/`fix:` prefix and no ticket number; add a body only when the reason is not
   obvious. Never commit `.env`, `dist/`, `node_modules/` or `.aven/runtime`, and never edit
   `bun.lock` by hand.

2. **Update from the default branch.** `git fetch origin main && git rebase origin/main`. Resolve
   conflicts in code you touched; if one is in a place you cannot judge, stop and tell me.

3. **Bring the database up.** `bash .aven/stack` starts the PostgreSQL 17 this repository uses in
   Docker and writes its `DATABASE_URL` to `.env.local`, which Bun loads. It is safe to repeat; run
   it if connecting fails. Then apply the schema from the repository root, which is also safe to
   repeat: `set -a && . ./.env.local && set +a && bun packages/db/src/migrate.ts`. Do not run
   `db:migrate` through `--cwd packages/db`: it reads `.env`, whose `DATABASE_URL` is not this thread's.

4. **Run the checks, and fix what your change broke:**
   `bun run format && bun run typecheck && bun run lint && bun run format:check && bun test apps packages`.
   `bun test apps packages` and not a plain `bun test`, which also picks up the Playwright specs and
   fails on them. Do not push while one fails. If a failure is not yours, say so with its output and
   stop.

5. **Run the e2e suite when a screen (`apps/platform`) or an API changed:** `bun run test:e2e`. It
   needs no Docker; it starts its own servers and its own `aven_e2e` database.

6. **Record proof for anything that changes what a screen shows.** Screenshot the changed screen —
   from the Playwright spec that covers it, or with `bun run dev` (web on :5173, API on :8000) and
   `bunx playwright screenshot --viewport-size=1280,900 <url> <file>` — and save it as
   `.aven/proof/<topic>/after.png`, with `before.png` too when you can screenshot `origin/main`
   first. Commit the images and show them in the pull request. Leave them in the branch for
   review; remove them only if I ask.

7. **Record a decision** when the change makes a choice worth keeping: add
   `docs/decision/<next number>-<name>.md` with a `# Title`, a `Status:` line and Context, Decision
   and Consequences, as `AGENTS.md` asks. Take the number after step 2's rebase: another change
   on `main` may have used the one you had in mind.

8. **Push the branch:** `git push -u origin HEAD`. Never force-push, and never push to `main`.

9. **Open the pull request against `main`, ready for review — not a draft.** Write the body to
   `.aven/pr.md` in this shape, then run
   `gh pr create --base main --title "<the commit subject>" --body-file .aven/pr.md` and delete the
   file:

   ```markdown
   ## What changed

   ...

   ## Why

   ...

   ## How it was tested

   - `bun run typecheck`, `bun run lint`, `bun run format:check` and `bun test apps packages` pass.
   - `bun run test:e2e` passes (when it was run).
   - ![after](.aven/proof/<topic>/after.png)
   ```

   The repository is public: keep customer names, internal links, tokens and private URLs out of
   the description and the screenshots. Check that the images show in the pull request; if one does
   not, link the file's URL instead. If a pull request already exists for this branch, the push
   updates it — do not open a second one.

10. **Do not merge and do not turn on auto-merge:** merging is mine. If I leave review comments,
    address them, rerun the checks and push.

11. **Tell me** the pull request's URL, which checks passed, and anything you could not verify.
