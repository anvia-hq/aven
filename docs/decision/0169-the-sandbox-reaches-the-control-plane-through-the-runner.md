# A sandbox mints identity tokens through a relay on its runner

Status: accepted. Replaces the way decision 0049 had a container reach the control plane.

## Context

0049 gave the container the control plane's origin with a loopback host replaced by `host.docker.internal`. That works on macOS, where Docker Desktop forwards the name to the host's loopback, and fails on Linux: the name is the Docker bridge's address, `172.17.0.1`, and a control plane published on `127.0.0.1` (the compose file's `127.0.0.1:2837`, which the runner beside the server uses) does not listen there. `aven id-token` in a thread's sandbox on such a host ended with `curl: (7) Failed to connect to host.docker.internal port 2837`. Neither the server's public address nor its web port helps: a tailnet name does not resolve from a container, and the web port is loopback too.

## Decision

- When the runner reaches the control plane at a loopback address, the container is given the runner's own address instead: `Sandboxes` starts, the first time a run carries an identity, a small relay (`identity-relay.ts`) on a port of the machine's choosing, bound to every interface as the sandbox hub already is, and the container reaches it as `http://host.docker.internal:<port>`.
- The relay passes on one request only, `POST /workload-identity/token` with its `authorization` and `content-type`, to the control plane at the address the runner uses, and answers anything else with a 404 and an unreachable control plane with a 502. It holds no secret: the credential in the request is the run's own and is checked by the control plane.
- A control plane at any other address is reached directly, as before.
- The relay stops with the runner's sandboxes.

## Consequences

- `aven id-token` works for the built-in runner on Linux with the default compose file, and the same way on macOS.
- Anything on the machine's network that can reach the relay can ask for a token, and needs a valid run credential to get one, which only a run's sandbox holds.
- A control plane the container cannot reach at its public address (a tailnet-only server) can still mint tokens for the sandbox, but a cloud still cannot fetch its keys to trust them: that is 0049's own condition.
