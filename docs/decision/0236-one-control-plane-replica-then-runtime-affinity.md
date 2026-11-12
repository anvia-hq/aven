# One control-plane replica, then runtime affinity

Status: accepted.

## Context

The control plane keeps live state in the memory of its process: each runner's WebSocket and the runs it holds (`RuntimeHub`, `hub.ts`), the channels browsers watch (`RunManager`, the bot runner, the viewer streams), the grants and tokens a run authenticates with (`gateway.ts`) and the grace a dropped runner is held for. Everything durable is in Postgres, and the schedule and thread-watch ticks claim their work in the database.

Two replicas behind one address would split that state: a runner is attached to one of them, a request for its machine (files, terminal, diff, ship) may land on the other, a browser may watch a run on the replica that is not running it, and a run's token is unknown to the replica that did not mint it.

## Decision

- **Run one control-plane replica** for any install, the hosted edition included, until a measured limit says otherwise. A release restarts it: runners reconnect and report their runs (`hold`, `reclaim`), so a deploy is a short disconnect, and is made when nothing is running (the check of the update guide).
- **When one replica is not enough, scale by runtime affinity**: the edge sends a runner's WebSocket, and every request for that runtime or for the threads that run on it, to the replica that owns the runtime, chosen by consistent hashing on the runtime id. No replica talks to another.
- **A runtime's replica is the only one that holds its connection, runs, channels and tokens.** A request that must reach a runtime carries its runtime id (or a thread id that gives one) in the path or a header the edge can route on.
- **Work that is not tied to a runtime** (the schedule, goal and thread-watch ticks) keeps claiming in the database, and each claim is made atomic before a second replica runs; the goal driver's local `failing` set is checked first.
- **Cross-replica forwarding** (a table of which replica owns which runtime, calls relayed over Postgres `LISTEN/NOTIFY` or Redis) is the alternative if a request must be able to arrive anywhere. It is not chosen now: it reaches the hub, the run streams and the gateway, and affinity needs none of it.

## Consequences

- Capacity is the one process's: its sockets, memory and CPU. The signal to revisit is that, not a runner count guessed beforehand.
- Affinity needs the edge (a load balancer or the proxy in front) to hash on the runtime id, and the platform's calls to carry it. Nothing in the open code changes until then.
- A replica that goes down disconnects only its runtimes, which reconnect to whichever replica owns them next.
- Until then, a control plane started twice by mistake misbehaves quietly. A start-up guard, such as a Postgres advisory lock held for the process's life, is cheap and is worth adding with affinity or earlier.
