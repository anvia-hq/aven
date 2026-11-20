# A server that is not a release build updates a runner to the newest release

Status: accepted. Supersedes part of decision 0148 (which offered no update at all on a server that is not a release build). Builds on decision 0146.

## Context

Decision 0148 compared every runner with the server's own release, `AVEN_VERSION`, and compared only the control plane's own runner with the newest release on GitHub. Its consequences said so plainly: a server that is not a release build, where `AVEN_VERSION` is `latest` or unset, "is never offered an update here".

A server started from a checkout is exactly that. It has no release to be behind, so `isBehind` answered false for every runner, `updateTo` was null for all of them, and the Update button of decision 0146 never appeared, in Settings > Runtimes or in the sidebar. A person developing Aven, or running a server from source, had one way to keep a runner current: a terminal, `aven update`, on every machine.

The reasoning behind 0148 does not hold in that case either. It feared a runner **past its server**, because the runtime wire changes and the control plane refuses a runner it does not speak. But a server from a checkout is not a release or behind one; it is whatever `main` holds, which is at or ahead of the newest release in wire version, and a runner the control plane accepted in `hello` is a runner it speaks to today.

## Decision

- `updateTarget` (`runtimes/update-target.ts`) names the newest GitHub release, which `latest-release.ts` already finds for the control plane's own runner, when the server has no release to name: `AVEN_VERSION` unset or not a version. A runner behind that release gets it, whoever the runner is, and its Update button appears as 0146 describes.
- Everything else stays as 0146 and 0148 left it. A server that names a release still sends a runner behind it that release, and only its own built-in runner follows the newest release past the server, because that runner updates the server too.
- The dialog no longer says the target is "the server's release", because on a server without one it is a release from GitHub: it says the release it goes to and that the runner restarts for a moment.
- Nothing new is asked of GitHub. The release lookup is the one 0148 added, at most once an hour, and `AVEN_RELEASES_URL` still moves it.

## Consequences

- A server from a checkout that cannot reach GitHub offers no update, as a released one could not. `aven update` still works, and so does running the runtime from the checkout.
- The newest release is a guess where there is no server release to follow, and it can be wrong in one direction: if `main` has not yet shipped what the newest release holds, a runner updated to it is **ahead** of the server, and the control plane refuses its `hello` until the server is updated. That is visible at once, in the row that goes offline, and the fix is to update the server's checkout. The reverse cannot happen: a runner the control plane refuses is offline, and an offline runner has no button.
- The button obeys the same gates as before: an owner or an admin, an online runner, one that says `canUpdate`, that is installed by `aven` and answers `runner.update`.
- A runner already on the newest release, or past it, is offered nothing.
