# Runtime providers and agent backends

Status: accepted. Adds to 0008 and 0219: a runner still works on the machine it runs on. This prepares two seams, each with one implementation, and records which one a runtime and a thread use.

## Context

Aven should run threads on more than a machine someone installed a runner on: a cloud VM, a hosted sandbox such as Vercel Sandbox, and others. It should also drive a thread with an agent other than its own: the Claude Agent SDK and the Codex SDK beside the native agent on `@anvia/core` and `@anvia/durable`.

0219 removed the container sandbox for a runner that works on its own machine, because a second way to run commands (an image, a desktop, a proxy, snapshots) cost more than it gave. Putting a remote-sandbox layer between the runner and its commands would bring that back: the diff, files, terminal, forks and git all act on the machine directly.

## Decision

Two axes, named apart from the runner:

- **A runner** is the process that connects to the control plane and drives runs. It keeps working on the machine it runs on, as 0219 says.
- **A runtime provider** is how a runner's machine comes to exist and is woken, on the control plane. A VM or a hosted sandbox is a provider that makes a machine and starts `aven runner` on it with a token; the runner connects out as any runner does, so the wire and the runner do not change. `manual` is today's provider: someone installed the runner, so the control plane can only find it connected or not. `RuntimeProvider` in `apps/control-plane/src/modules/runtimes/types.ts`, `manualProvider` and `reachRunner` in `runtimes/providers.ts`.
- **An agent backend** is what turns a run's prompt into the events of a thread, on the runner. `native` is today's: an Anvia agent journaled by `@anvia/durable`. `AgentBackend` in `packages/runtime-client/src/types.ts`, implemented by `DurableRuns`; the run driver depends on the interface only.

Since the runner and the agent share a machine, a backend such as the Claude Agent SDK or Codex runs beside the runner and uses its own tools there, and Aven does not need a remote-command layer.

## Where each is kept

- **A runtime records its provider**, `runtimes.provider`, `manual` for every runtime there is. A runner that is connected is used at once; one that is not is reached through the provider its runtime records (`reachRunner` in `runtimes/providers.ts`), which for `manual` says it is offline, with the same message as before. Every call to a thread's or a bot's runner (`runnerFor`, `botRunnerFor`) and every run (`RemoteRuntime`) reaches its runner this way.
- **Starting a run waits for its runner.** `Runtime.start` and `resume` are asynchronous, so a provider can bring a machine up first. `RunManager` holds the thread from its busy check until the run has begun (`#reserved`), so a second start in between is busy and a start that fails leaves the thread free.
- **A thread records its backend**, `threads.agent_backend`, `native` for every thread, and keeps it for its life, as it keeps its runner (0177).
- **A runner names the backends it drives** in `hello` (`backends`, optional, so the wire version stays 56). A runner that names none is older and drives `native` only; names the control plane does not know are dropped. A run whose thread's backend its runner does not drive is refused with a 503 telling the person to update the runner, and nothing is sent to it.
- **A run carries its thread's backend.** `run.start` and `run.resume` say `backend`, the thread's `agent_backend`, and the runner drives that run with the backend of that name (`backendFor` in `packages/runtime-client/src/agent-backends.ts`). The field is optional, so the wire version stays 56. A runner from before does not read it and drives native, which is the only backend it is sent. A run that leaves it out is native, which is what a control plane from before sends. A name this runner does not drive ends the run, and no other backend is started.

## What is not done yet

- No provider other than `manual`. `codex` is the second backend (decision 0237): a thread can be started on it, and a runner that names it in `hello` drives it. A provider's settings (its account, region, machine size) still go on `runtimes` with a future provider. Decision 0237 supersedes, for Codex only, the consequences below that an SDK backend calls its provider through the model gateway and that it may lack questions, restart, steering, goals and compaction.
- A thread's backend is chosen when the thread is created (`native` or `codex`, decision 0237) and then kept.
- A cloud machine has no folder of its own to serve, so a project on it is a repository that the runner clones (`repo.access`, `git-clone.ts`), which a project can already be.

## Consequences for the backends to come

- The SDK backends call their providers through the model gateway: its base URL and the run's token, as the native one does. A backend states which provider kinds it accepts.
- Aven's own tools (`ask_user`, `request_secret`, `show_artifact`, memory, cockpit, forks) reach an SDK backend through an MCP server the runner hosts for the run.
- What the native backend has that an SDK may not (a run parked on a question, a run taken up after a restart (0024), steering (0098), goals (0022), compaction (0097)) becomes something a backend says it supports, and the platform offers only that.
- The control plane's transcript is the thread's, not the backend's: a backend keeps its own history (a journal, a session file) and files what the thread shows with `memory.append`.
