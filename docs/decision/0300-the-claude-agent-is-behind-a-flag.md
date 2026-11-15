# 0300: The Claude agent is behind a flag

Date: 2026-11-15

Status: accepted. Adds to 0220 (agent backends) and follows the provider list of 0299.

## Decision

- `AVEN_CLAUDE_BACKEND` is `on` or `off`, and is on when unset, since the Claude agent already ships and a machine that has it must keep it. Any other value stops the control plane at startup.
- Off is enforced in one place, `claudeSetupService.requireFor`, which a new Claude thread, a message, a compaction and an answer all pass through. It refuses with "The Claude agent is turned off on this server". A fork or a continuation of a Claude thread goes through thread creation and is refused the same way.
- The platform reads `claudeBackend` from `GET /platform/config`. With it off the composer does not offer a Claude model, Settings leaves out Claude Subscription, and `/settings/claude` says it is off.
- A thread that already runs on the Claude agent stays readable. It cannot run until the flag is on again. Saved setup tokens are kept.

## Consequences

- Turning it off does not touch runners: a runner can still offer the backend in `hello`, and the control plane simply never asks for it.
- The flag is read from the environment, so a change needs a restart. A setting a platform owner can change in Settings is later work if it is wanted.
