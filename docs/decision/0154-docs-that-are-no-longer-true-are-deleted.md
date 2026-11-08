# 0154: A doc that is no longer true is deleted, and its folder renumbered

Status: accepted. Changes the rule in `docs/README.md` that outdated docs are kept and marked superseded, and that numbers are never renumbered.

## Context

`docs/bugs/` kept two notes whose bugs are fixed upstream in the Anvia versions the repository uses, and whose workarounds are gone. Kept under their numbers, they read as current, and the folder had a gap where they had been. The notes describe history that `git log` already holds.

## Decision

- A doc that no longer describes anything true (its bug is fixed upstream and its workaround is removed, or the code it describes is gone) is deleted rather than marked superseded.
- The folder is then renumbered without gaps, and every link to a moved doc is updated in the same change.
- This applies to every folder in `docs/`. Decisions keep their own rule: a superseded decision keeps its number and its `Status:` line, because it still records what was decided and why.

## Consequences

- `docs/bugs/` holds only the four notes whose workarounds are still in the code: `0001` to `0004`. The fixed ones are in git history.
- A later change that renumbers a folder has to find every reference to it, which `grep` for `docs/bugs/` does.
