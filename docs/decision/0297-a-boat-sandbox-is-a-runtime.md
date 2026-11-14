# 0297: A boat.dev sandbox is a runtime

Date: 2026-11-14

Status: accepted. Adds to 0220.

## Decision

- `boat` is the second `RuntimeProvider`. A runtime of that kind is one boat.dev sandbox, persistent, shared by the threads that pick it. The hub is one connection per runtime, so this is not a sandbox per thread (0221's per-thread machine is still not built). `lifetime` stays `persistent`. GitHub mode starts as `person`, because the sandbox has no login of its own.
- The boat API key and the runner token are encrypted with `PROVIDER_ENCRYPTION_KEY`, the same way a model provider's key is. Creating the runtime checks the key with `GET /me`. The key is not an environment variable and is not written into a boat command: boat keeps command history, so the token is written to a file and the command sources that file, then deletes it.
- The control plane talks to `https://boat.dev/api/v1` with `fetch` (`runtimes/boat`). It does not depend on the boat SDK. A sandbox is created private, with `noEnv`, named `aven-<runtime id>`, and with auto-stop off (`ttlSeconds: null`). A trial that rejects that (`trial_auto_stop_required`) is retried with a two-hour stop and a different idempotency key. Waking a sandbox that is stopped resumes it; one boat no longer has is created again.
- `reachRunner` uses a connected runner at once. A boat runtime that is not connected is woken, the runner is installed or restarted inside the sandbox, and the call waits for the connection. `release` is the runner's `sandbox.release`, the same as `manual`: the sandbox stays up because other threads share it. Revoking the runtime stops the sandbox. It does not delete it.
- The sandbox has to dial this server. `AVEN_BOAT_RUNNER_URL`, or `BETTER_AUTH_URL` plus `/api`, must be a public http(s) address. Localhost and private addresses are refused. `AVEN_BOAT_API_BASE` overrides the API origin for tests.

## Consequences

- A project selects a boat runtime the same way it selects any other. The first tool of a thread is the one that waits for the sandbox. A boat runtime that is asleep cannot be a continuation target until it is online.
- A paid sandbox with auto-stop off keeps billing until the runtime is revoked. A trial sandbox stops after two hours and the next wake resumes it. A running Aven runner does not extend boat's auto-stop deadline.
- Replacing the boat API key is revoke and add again. Rotating the runtime token rewrites the encrypted runner token; the next wake starts the runner with it.
- This was checked against boat's published API, not against a live account. The execute-command page still names `boat_starting` and `boat_direct_failed`; the overview names `sandbox_starting`, `sandbox_not_ready` and `sandbox_direct_failed`, and that is what a failure message shows. Deleting a sandbox wants the header `X-Ascii-Confirm-Delete`, so revoke stops the sandbox and leaves the disk.
