# Doctor and the runner check that a sandbox reaches its runner

Status: superseded by 0219 (the container sandbox, Desktop, Browser and snapshots are retired). Was: accepted. Follows decision 0010 (a Docker sandbox per thread).

## Context

A sandbox's daemon connects out to the runner's hub at `host.docker.internal:<port>`. On a Linux machine with a firewall (ufw) that drops what the Docker bridge sends to the host, the container started and its daemon never connected: a thread's first tool call hung for 90 seconds and the run ended with "The sandbox did not connect within 90s". `aven doctor` was all `ok`, since it checked Docker, git, the server, the runner service and the image, and never that a container can reach the machine.

## Decision

- `aven doctor` has a `sandbox reach` check on a machine with a runner: it listens on a port of its own, bound to every interface, and has a throwaway container of the runner's sandbox image open a connection to it through `host.docker.internal` (`runtime-client/src/host-reach.ts`). A refused or timed-out connection fails the check and says what to do (on Linux with ufw: `sudo ufw allow in on docker0`). A check that could not run (the image's shell missing, Docker erroring) passes and says why, since it must not blame the firewall for what it did not see.
- A runner that has started a container and sees no daemon after 5 seconds tries the same connection from inside that container, to the hub's port. If it is blocked the run fails then, with the same advice, instead of after 90 seconds. A daemon that is only slow keeps its full 90 seconds.

## Consequences

- A firewall that blocks containers is found by `aven doctor` and by the first thread, in seconds.
- Doctor starts a container of the sandbox image (a second or so).
