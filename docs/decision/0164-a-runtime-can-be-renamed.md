# A runtime can be renamed

Status: accepted. Builds on 0008 (runtimes) and 0073 (the built-in runner).

## Context

A runtime's name is whatever was typed when it was added, and the built-in runner is always "Control plane" with a "Built in" line under it. A person who moved a runner to another machine, or has several, could not make the list say which is which.

## Decision

- **`PATCH /runtimes/:id` with `{ name }`** (1 to 100 characters) renames a runtime. The name is a label: the token, the connection and the runs are untouched.
- **Who may**: the runtime's owner (whoever added it), or an owner or an admin of the workspace. **The built-in runner** belongs to no workspace and is shown in every one, so only a **platform owner** (0077) may rename it, and its name is kept when the server starts (`ensureLocal` inserts it once).
- **Settings > Runtimes** has a Rename button on each row it may be used on (`components/rename-runtime-dialog.tsx`), a dialog with the current name.
- **The built-in runner is marked with an icon** beside its name, with "Built in" for its tooltip and accessible name, instead of a line of text under it.

## Consequences

- Renaming the built-in runner changes its name for every workspace on the install.
- Threads and projects refer to a runtime by id, so they follow a rename.
