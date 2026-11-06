# A thread's start-up is timed, and its MCP servers are connected once

Status: accepted. Builds on 0085 (a person's MCP servers), 0024 (a run is journaled), 0021 (every thread agent runs through durable) and 0030 (a run marks the start of its turn for the diff).

## Context

The first token of a thread felt slow. Reading the run's path — the control plane from the HTTP request to `run.start` on the wire, then the runner from it to the model's first request — showed that a good deal of work that no model call needs sits in front of it: the whole sandbox (repo access, clone or snapshot restore, container start, the daemon waiting to dial out, `.aven/resume`), two container `exec`s that sign the sandbox in as the person and give it an identity, the installation of the thread's skills, a `git add --all` of the working tree to mark the turn, and the person's MCP servers. All of it was awaited, one piece after another, before the agent was in the journal and the model asked anything.

Two of those were avoidable without giving anything up. The MCP connections are reached over the network and want nothing of the sandbox, yet were made after it, so their handshake was added to the sandbox's time instead of hidden behind it. And they were the run's alone: every message, and every answer to a question, handshook again with every server, closed them at the end of the run, and paid the same seconds over for a conversation that had already connected them a minute before.

There was also no way to measure any of it. Nothing on the path logged how long a step took, so "the first token is slow" could not be split into the control plane's queries, the sandbox, the skills, MCP or the model's own prefill.

## Decision

- **The runner's steps are timed, opt-in.** `AVEN_TIMING` set to anything turns on `[timing]` lines from both the control plane (`packages/runtime-client/src/timing.ts`, called from `threads/messages.ts`'s `start`) and the runner (`run-driver.ts`'s `execute` and `acquire`): each step prints what it took since the step before and since the run began, and the runner prints the model's first output (`text`, `reasoning` or `tool_start`) as the point the thread started to answer. Unset, it prints nothing and costs a no-op call.
- **The person's MCP servers are connected while the sandbox is being got ready, not after it.** `acquire` starts `connectMcp` before `sandbox.acquire` and waits for it where the agent is built, since only the agent's tools need it. One wait instead of two.
- **A thread's MCP connections are the thread's, not the run's.** `mcpConnections` keeps them per thread with the key of the servers they were connected from (id, name, url, headers, local switch). A run whose servers match takes them over and sends the server nothing; a run with different servers closes the old ones and connects anew. The connections end when other servers replace them, when the thread's sandbox is released (`boxes`, checked after each connection and by a one-minute sweep), or with the process.
- **The two sign-ins go together.** `prepareRun` runs the GitHub and identity sign-ins with `Promise.all`: they are independent, both only reach later tools, and each is a container round trip.
- **What stays in front of the model.** The sandbox (it is what the tools are), the skills (the instructions list them), `markTurn` (the diff's baseline) and the sandbox's sign-ins. Moving those off the path is a bigger change than this one: the container would have to start lazily for threads with a repository as `started-on-use.ts` already does for bots, and `markTurn` would have to be awaited by the first tool call rather than by the run.

## Consequences

- A server that is down is reported on every run (`mcp.report`), even when the run reused the thread's connections, so Settings keeps saying so until it is fixed. A set that is not whole (a server that did not answer) is not reused: the next run tries again, so a server that comes back is used without the person changing anything.
- A connection is now open while a thread is idle (up to the sandbox's 15 minutes), where before it was closed as its run ended. A thread whose sandbox was released has its connections ended by the next run or the sweep, so a runner does not accumulate them.
- Header changes are seen at the next message: the key includes them, so the run that comes with new headers reconnects. A server whose answers change without its settings changing is not reconnected until the thread's sandbox is released.
- The connections are still in memory only, and still in no record or journal: a run taken up after a restart has none, as before.
- `AVEN_TIMING` is a person's debugging switch, not something to leave on: it prints a line per step per run.
