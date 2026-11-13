# 0273: A pull in a thread fetches GitHub through the folder

Status: accepted. Refines 0218 (a runner serves folders) and 0231 (a ship reaches GitHub from the folder).

## Context

A thread works in a clone of the person's folder, on its own branch (0218), so `origin` there is the folder, not GitHub. Asked to "git pull" or "pull from upstream main", the agent pulled from the folder, found it up to date and said so, though the folder can be behind GitHub (on `big-machine` it was several pull requests behind). It then told the person to run `git pull` in the folder and offered to do it. People work from threads all the time, so each pull ended in that detour, and a thread started from a stale folder branched off old code.

0231 told the ship prompt that `origin` is the folder. A pull had no such note.

## Decision

- **The coding instructions say what a pull means.** When asked to pull, update, sync or fetch from main, upstream or GitHub, the agent reads the folder's GitHub address with `git -C <folder> remote get-url origin` (the folder's path is its own `origin`), runs `git fetch <address> <branch>` in `/workspace` and merges `FETCH_HEAD` into the branch, the default branch unless the person names one.
- **The folder is not changed.** Only reading its remote is outside `/workspace`; its branches stay where they are, so a person's own checkout is not moved under them.
- **It says what it reached.** The agent names the commit it merged up to, and says plainly when the fetch failed.

## Consequences

- A pull in a thread brings in GitHub's `main` even when the folder is behind.
- The folder stays behind until its owner pulls there; a thread no longer depends on that.
- The fetch runs as the person on their machine (0044), so it works wherever their git can already reach GitHub, and fails with the reason where it cannot.
