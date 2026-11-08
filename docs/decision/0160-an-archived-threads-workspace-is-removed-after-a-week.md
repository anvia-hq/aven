# 0160: An archived thread's workspace is removed after a week

Status: accepted. Refines decision 0118 (archiving frees the sandbox and keeps the files).

## Context

Archiving a thread stops its run and frees its container, and its files stay so the Files and Changes panels still work. Nothing ever removed them. On one runner 20 archived threads held 23 GB (a clone and whatever the agent installed, such as `node_modules`, each), and the `aven-env-*` environment images and snapshots, which a runner treats as stale after 72 hours but never deleted, added tens of GB more. A rebuilt environment also left the image it replaced untagged.

## Decision

- The runner marks a thread when it gets the `sandbox.release` call that archiving sends (`<home>/archived/<thread id>`), and clears the mark when the thread's next run acquires its sandbox. No wire message changes.
- An hourly sweep, and one a minute after the runner starts, removes the workspace of a thread marked for `AVEN_ARCHIVED_KEEP_DAYS` days (7 by default, `0` keeps them for ever), with its image pin and its skills folder. A thread that is in use is never removed. Artifacts and uploads stay, since the conversation still shows them.
- The same sweep removes a snapshot older than 72 hours, with its spare and its image, when no remaining thread pins that image and Docker agrees it is not in use.
- Building an environment removes the image it replaces.
- A thread that runs again after its workspace was removed gets a fresh clone, as a thread on a runner that lost its workspace does.

## Consequences

- Archived threads' files are readable for a week; after that the Files and Changes panels show nothing and a continuation from such a thread carries no patch.
- Threads archived before this runs have no mark and are not removed; clean those by hand once.
- The control plane does not know about any of it: a runner that is offline when a thread is archived never marks it.
