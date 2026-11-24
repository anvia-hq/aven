# Sprites are a sandbox provider

Status: accepted. Adds to 0307 (a provider is its own folder in `@aven/sandbox`) and 0392 (capabilities, credentials, the reconciler). Decided 2026-11-24.

## Context

Fly.io's Sprites are persistent Linux VMs made for agents: one comes into existence in about a second, keeps a 100 GB disk across idle pauses, answers on its own HTTPS URL, and goes `warm` (memory frozen) after ~30 seconds without activity and `cold` later. Their API (`https://api.sprites.dev`, bearer token) is smaller than the other providers': create and delete a named Sprite, read it, write a file, run a command, and checkpoints. There is no pause call, no lifetime, no snapshot that can be started as another Sprite, and no size to pick.

That shape decides how a thread's runner lives on one:

- **Waking is a command.** `GET /v1/sprites/{name}` both wakes a sleeping Sprite and says whether it still exists, and `POST /v1/sprites/{name}/exec` runs a command in it. So `start` is the same shape as boat and Lizard: read the Sprite, create it when Sprites has lost it, write `runner-boot.env` with the Filesystem API, then exec the boot script that installs `aven` and starts `aven runner run` with `setsid nohup`. The runtime is installed under `/home/sprite/.local/bin`, since the shell is the `sprite` user.
- **A hold keeps it awake.** A Sprite pauses once nothing is happening in it, and a pause drops open TCP connections, which would cut the runner's WebSocket every time the release was slow. `sprite-env`'s task API on `/.sprite/api.sock` is a hold on the current run, so the boot script registers a task named `aven` for an hour, `extend` renews it (clamped to that hour, and to `AVEN_SPRITES_AUTO_STOP_SECONDS`), and `stop` deletes it. Nothing else is needed to pause a Sprite: with no hold it sleeps on its own. `defaultAutoStopSeconds` is therefore the hold's hour, and `supportsMaxLifetime` is true because that hold is a real cap on how long a Sprite runs unattended.
- **`stop` ends the runner and releases the hold**, rather than calling a pause that does not exist. The disk and the frozen memory are Sprites' own, so `stopMode` stays `native_resume`.
- **No environment.** A checkpoint belongs to one Sprite, is restored into it, and cannot be started as a new one, which is what an Aven environment is for. `saveEnvironment` answers `failed` with that reason (the environments page records it and retries nothing), `readEnvironment` answers `null`, and `removeEnvironment` answers `true` because there is nothing remote to delete.
- **One size.** A Sprite always has 8 vCPU, managed memory and 100 GB, so the boat machine type on the runtime row is ignored and the spend brake prices a flat rate for 8 vCPU and 8 GB plus hot storage (`SPRITES_COMPUTE_MICROS_PER_HOUR`, `SPRITES_STORAGE_MICROS_PER_GB_MONTH`).
- **Names.** The Sprite's name is the row's sandbox id, derived from the runtime id (`aven-<24 hex>`), so a row that has lost its Sprite recreates the same name instead of leaking a new one per wake.

## Decision

`sandbox/src/sprites/` is a provider like any other: its `client.ts` speaks the Sprites API, `boot.ts` holds the boot script and the hold commands, `wake.ts` creates and boots, `stop.ts` ends the runner and releases the hold, and `module.ts` exports the `CloudProviderModule` with `kind: "sprites"`. Its name joins `SANDBOX_PROVIDERS` and `RUNTIME_PROVIDERS`, it takes the template runtime id `00000000-0000-4000-8000-000000000005`, and Settings > Sandbox accepts it with a Sprites token, an optional API address (defaulting to `https://api.sprites.dev`) and the address a Sprite dials.

## Consequences

- A Sprites installation can be offered next to boat, Spaces and Lizard without touching the lifecycle state machine, the drain, the spend brake or the delete backoff.
- Threads on Sprites cannot keep a saved environment, so their first run after a project's environment is rebuilt starts from the Sprite's own image.
- A Sprite's cost is higher per hour than a small sandbox on the other providers, because it is always 8 vCPU; the spend brake's default rates say so.
- The client is written against the published OpenAPI and was not run against a live Sprites account, so the first real installation is the test of its parsing.
