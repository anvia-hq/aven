# 0306. Spaces is an Aven Cloud provider of its own

Status: accepted. Adds to 0299, which made Aven Cloud a list of providers.

## Context

Spaces runs sandboxes as microVMs on hardware the operator controls, and its API follows boat's. That tempted a shared client: one `BoatClient` told which service it spoke to. We did not do that. Spaces is a separate project that can change its API at any time, boat's provider is released and tested against the real service, and any shared code means a change for spaces could break boat.

## Decision

- Spaces is a `RuntimeProvider` (`kind` `spaces`) in `runtimes/spaces/`, with its own client, error type, boot script, wake flow, lifetime tracker and settings. It imports nothing from `runtimes/boat/`, and `runtimes/boat/` is not changed by it.
- The client sends spaces only the fields spaces takes today (`name`, `type`, `ttlSeconds`, `labels`; an empty body to resume and stop) and nothing boat's spec has beyond them (`noEnv`, `visibility`, a resume `ttlSeconds`, the delete confirmation header), because spaces refuses unknown fields. If spaces accepts more later, this client does not have to change.
- The provider answers two methods beyond `RuntimeProvider`, `stop(runtimeId)` and `destroy(sandboxId)`, which the registry in `providers.ts` and the 48-hour sweep call by provider instead of by a boat client. Boat's equivalents stay as they were; the sweep and the runtime delete route reach each by the runtime's provider.
- The runtime rows are the same: `boat_sandbox_id`, `boat_runner_token_encrypted` and `boat_machine_type` hold a spaces sandbox too. They are only column names, and renaming them is a migration for later.
- Settings are `AVEN_SPACES_API_BASE`, `AVEN_SPACES_API_KEY`, `AVEN_SPACES_RUNNER_URL` and `AVEN_SPACES_AUTO_STOP_SECONDS`. The provider is offered when `AVEN_CLOUD_PROVIDERS` names `spaces` and both the address and the key are set.
- A spaces guest has no service manager and loses every process when it stops, so the boot starts `aven runner run` as a detached process and runs again after every resume; the sandbox is given the 600-second maximum for this command, since the first run installs packages and downloads the binary. The runner address may be private, which a spaces sandbox can often reach and a boat one cannot.

## Consequences

- The guest image must be Debian or Ubuntu with `apt-get` (`SPACES_MSB_IMAGE=ubuntu`): the runner is a glibc program.
- The boot script takes root through `sudo -n` when the sandbox runs as a plain user (the deployed guest runs as `user`, uid 1000, with passwordless sudo), and installs the runner to `/usr/local/bin`.
- Tested against a real spaces server with real microVMs: the first start installs and connects the runner in about 34 seconds, spaces stops the sandbox at its TTL, and the next wake brings the runner back in about a second. Not tested: a spaces server on another machine reached over a network, and a run that clones a real repository inside the sandbox.
- A sandbox stopped by hand can leave a dead runner connection until the hub notices, the same limit as boat's.
