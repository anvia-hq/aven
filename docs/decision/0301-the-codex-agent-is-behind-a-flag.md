# 0301: The Codex agent is behind a flag

Date: 2026-11-15

Status: accepted. Follows 0300, which does the same for the Claude agent. Superseded in part by 0309: the flag now gates the `codex-subscription` provider in Settings > Providers.

## Decision

- `AVEN_CODEX_BACKEND` is `on` or `off`, and is on when unset, since the Codex agent already ships and a machine that has it must keep it. Any other value stops the control plane at startup.
- Off is enforced in one place, `codexSetupService.requireFor`, which a new Codex thread and a message on an existing one pass through. It refuses with "The Codex agent is turned off on this server".
- The platform reads `codexBackend` from `GET /platform/config`. With it off the composer does not offer a Codex model, Settings leaves out Codex, and `/settings/codex` says it is off.
- A thread that already runs on the Codex agent stays readable. It cannot run until the flag is on again. Saved API keys are kept.

## Consequences

- The flag is read from the environment, so a change needs a restart, as with 0300.
- Both agent flags are parsed with `featureChoice`; a further backend adds a flag the same way.
