# — Anvia Lens is a platform setting, and only the native agent is traced

Status: accepted. Decided 2026-11-17.

## Context

`@anvia/lens` (1.2.5) ships traces of an agent to a Lens server: one trace per run, from the model
call to each tool result, which is what evaluations, datasets and scores are built on. It is given an
address and two keys — a public one and a secret one — and returns an `AgentObserver` the agent takes
in its `observability` option. The client owns its own OpenTelemetry providers and never registers
global ones, so nothing else in the process is traced with it.

Those keys belong to the installation, not to a workspace or a person, and they must be rotatable
without a restart and not sit in `.env`. That is the same shape of value as the Aven Cloud sandbox
server (0311) and the server's default models (0243), both of which are rows in `platform_settings`
with the secret encrypted and a section in the settings that edits them.

Aven runs three agent backends (`native`, `claude`, `codex`, decision 0379). Only `native` is built on
`@anvia/core` and takes an `AgentObserver`; the other two are the Claude Agent SDK and the Codex SDK,
which report nothing to Lens.

## Decision

- **Settings > Installation has an Anvia Lens section**, behind `AVEN_LENS` (`on`/`off`, off unless
  set). The address, the public key, the secret key and what a trace keeps (`safe`, no prompt or
  response bodies, or `full`) are the platform owner's; `lensSettingsService` keeps them in
  `platform_settings` under `lens_settings`, the secret key encrypted with `PROVIDER_ENCRYPTION_KEY`,
  and returns only its last four characters. `GET/PUT/DELETE /platform/lens` are the platform owner's.
- **The flag is enforced where the setting is read for a run** (`forRun`), not in the router: with the
  flag off a saved row is kept but no run carries it, and `/platform/config` says `lens` so the form
  is not shown. Saving while the flag is off is allowed — a row written before the flag was turned on
  is used once it is.
- **A run carries the setting, not the runner's disk.** `lens` is an optional field on `run.start`,
  `run.resume` and `bot.reply`, and on `RunSecrets`, so a runner that reconnects mid-run gets it in
  `run.attach`. It is deliberately not part of the run record: a secret key is not written to a
  runner's journal. A run that is taken up again after the runner lost it is simply untraced.
- **Only a `native` run carries it.** The control plane leaves the field out for a thread whose
  backend is `claude` or `codex`, and the runtime hands it to `createCodingAgent` and `createBotAgent`
  only, which are the native agents. Subagents of a native run carry it too.
- **One Lens client per runner, reopened when the setting changes** (`packages/agents/src/lens.ts`):
  the observer is registered as `lens` and is the run's `primaryTrace`. It is closed when the runner
  stops and when the control plane shuts down (a bot with no computer runs its native agent in the
  control plane, 0324).
- **A setting Lens refuses does not fail a run.** An address it rejects is logged and the run goes
  untraced, as an unreadable row is (0311).
- Capture mode is the owner's choice per installation, and `safe` is the default.

## Consequences

- The wire gains an optional field on three messages and on `RunSecrets`; nothing is refused, so
  `WIRE_VERSION` stays.
- `@aven/agents` now depends on `@anvia/lens` and its OpenTelemetry packages, which the control plane
  and every runner load.
- A Claude or Codex run is invisible in Lens, which is the point: their SDKs take no observer. A trace
  of one of those threads needs the SDK's own telemetry, later and separately.
- The Lens keys travel to a runner over the same authenticated connection as the model gateway's token
  and the identity credential, and are held in memory only.
- Not decided here: scores and end-user feedback from a thread's messages, dataset or prompt access
  (`lens.score`, `datasetClient`, `promptClient`), and a "test the connection" button that checks the
  keys on save.
