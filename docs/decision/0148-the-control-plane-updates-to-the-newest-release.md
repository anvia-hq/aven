# 0148: The control plane can update to the newest release

Status: accepted. Builds on decision 0146 (the runner Update button).

## Context

Decision 0146 compares a runner with the server's release, because a runner past its server may be refused. That left nothing to update the server itself: the server and its built-in "Control plane" runner always match, so that row was never behind and never had the button, and the server was updated with `aven update` over ssh.

## Decision

- The control plane asks GitHub for the newest release the way `aven update` does, by following `/releases/latest`'s redirect (`runtimes/latest-release.ts`), at most once an hour and again after five minutes when it could not ask; the release known is always given at once and refreshed in the background, so a slow GitHub never holds the list, and a failed question keeps the last release found. `AVEN_RELEASES_URL` moves it, as it moves the CLI's.
- Each runner in `GET /runtimes` has `updateTo`, the release its Update button takes it to (`runtimes/update-target.ts`): the server's release for a runner that is behind it, and, for the control plane's own runner only, the newest release when the server is behind that. The list also says `isControlPlane`. The button shows when `updateTo` is set, and `POST /runtimes/:id/update` sends the runner to the same release: it is refused with a 409 when there is none (a restart for no change) or when the release the person saw in the dialog (`release` in the body) is no longer the target.
- "Updating…" is kept in localStorage. It ends when the runner is back on another release, or after five minutes, when the person is told if the runner is still on the release it began on (`updating.ts`).
- The control plane's own runner is on the server's machine, so its `aven update --release` updates the server too; the dialog says the server is unavailable for a few seconds. Once the server is on the new release, every other runner is behind it and has its own button.

## Consequences

- A server whose own runner is off, or that is not a release build (`AVEN_VERSION` is `latest` or unset), is never offered an update here.
- A server that cannot reach GitHub offers none; `aven update` still works.
