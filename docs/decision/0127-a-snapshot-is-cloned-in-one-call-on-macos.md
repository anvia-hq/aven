# A snapshot is cloned in one call on macOS

Status: accepted. Adds to 0043 (a repository sets its environment up), whose later threads start from a copy of the snapshot's workspace.

## Context

A thread on a project that has an environment starts from a copy of the snapshot's workspace, `node_modules` included, before its container starts and before the model is asked anything. On macOS that copy was `cp -cpPR`, which clones file by file: 42,000 files and 858 MB took 6 to 8 seconds on APFS, nearly all of it system time. Measured on a local thread, the first model output came 9.6 seconds after the thread was made, of which the model took one second.

## Decision

On macOS the copy is a single `clonefile(2)` of the whole directory (`snapshots.ts`'s `cloneDirectory`, through `bun:ffi`), which APFS does without visiting the files: 0.9 seconds for the same workspace. It needs a destination that does not exist, so an empty one is removed first, and any failure (another file system, a destination that is not empty) leaves the copy to the `cp` it was. Linux keeps `cp --reflink=auto -a`, which has no single call to use.

## Consequences

A local thread starts about six seconds sooner. A Linux runner still copies file by file, so its time to start depends on its file system (a reflink-capable one is quicker).
