# 0146: An owner or an admin updates a runner from the platform

Status: accepted. Builds on decision 0073 (install and update with a script).

## Context

Settings > Runtimes and the sidebar's machine rows already say when a runner is on an older release than the server, but the fix was to open a terminal on that machine and run `aven update`.

## Decision

- A runner that is an installed `aven` (`aven runner run`, a release build) says `canUpdate` in `hello` and answers a new call, `runner.update` (wire version 49), with `started`, `busy` (a run or a bot's reply is going: an update restarts the runner and would cut it off) or `unsupported` (a runner started from a checkout, which has no `aven` to update).
- `POST /runtimes/:id/update`, for an owner or an admin of the workspace, asks an online runner that can; the control plane sends this server's own release (`AVEN_VERSION`), or none for the latest, and answers 202 once the runner has agreed. A refusal is a 409 with the reason; an offline runner, or one that does not answer, is unavailable; a runner of another workspace is not found.
- The runner answers first and starts the update a second later, outside its own process, because the update ends with the service restarting, which stops what the service started: a transient unit of the user's systemd on Linux (`systemd-run --user`), a process in a session of its own elsewhere (`apps/cli/src/detached-update.ts`, output in `update.log`). It is `aven update --release <release>`, so the binary, the sandbox image and, on a machine that has the server (the control plane's own runner), the server are updated as `aven update` does, and the release is checked against `checksums.txt`. The control plane only names a release number, which the runner checks is one before passing it to a command.
- The platform shows an Update button on a runner that is online, behind and able to, for an owner or an admin (the sidebar's row, Settings > Runtimes), after a dialog that says what it will do: the control plane's own runner updates the server too, which is unavailable for a few seconds. The row says Updating until the runner is back on another release, for up to five minutes.

## Consequences

- A runner on a release before this one has no button: it is updated by hand once.
- Running work blocks an update on that runner; the server's own update, from the built-in runner, can still interrupt runs on other runners, which the dialog says only for the server.
- Anyone who can make the control plane send `runner.update` can make a runner install an official release, never other code.
