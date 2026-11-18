# A spaces sandbox runs the runner of the server's release

Status: accepted. Adds to [0336](0336-a-lease-from-an-earlier-boot-is-stale-and-an-open-that-failed-is-retried.md) and [0148](0148-the-control-plane-updates-to-the-newest-release.md).

## Context

The boot script of a spaces sandbox installed `aven` only when the sandbox had none. A sandbox lives for days and is stopped and started again, and each start runs the runner it already had: a sandbox created on 0.10.3 still ran 0.10.3 after the server moved to 0.10.5, so a fix to the runner (0336) never reached it, and a release that changes the runtime wire version would refuse it with no way to ask for an update (0146 needs a connected runner).

## Decision

- **The control plane tells the sandbox its release.** `spacesBootEnv` writes `AVEN_RELEASE=<server's AVEN_VERSION>` into the env file when it is a plain `X.Y.Z` (`spacesRelease`); a development or prerelease build writes nothing.
- **The boot script brings `aven` to that release before it starts the runner.** When `aven version` differs, it downloads that release's archive for the sandbox's CPU and checks it against `checksums.txt`, as it did for the first install, and replaces `/usr/local/bin/aven`. A sandbox with no `aven` installs that release, and the latest one when that archive cannot be fetched.
- **A failed update keeps the `aven` the sandbox has**, with a line in the boot output, so a release that was never published, or a download that fails, does not keep a sandbox from starting.
- Without `AVEN_RELEASE` nothing changes: an installed `aven` is kept and a missing one is the latest release.

## Consequences

- A sandbox that is woken runs the runner of the server it talks to, so the runner and the control plane agree on the wire version.
- A wake downloads the archive once per release, which adds a few seconds to the first wake after a server update.
- A sandbox newer than its server is brought back down to the server's release, since a runner and its control plane must match.
- Boat sandboxes are not changed: their boot reinstalls through `install.sh` only when the runner service is missing.
