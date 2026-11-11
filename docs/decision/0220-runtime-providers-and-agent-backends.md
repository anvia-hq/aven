# Runtime providers and agent backends

Status: accepted. Adds to 0008 and 0219: a runner still works on the machine it runs on. This prepares two seams and changes no behaviour; each has one implementation.

## Context

Aven should run threads on more than a machine someone installed a runner on: a cloud VM, a hosted sandbox such as Vercel Sandbox, and others. It should also drive a thread with an agent other than its own: the Claude Agent SDK and the Codex SDK beside the native agent on `@anvia/core` and `@anvia/durable`.

0219 removed the container sandbox for a runner that works on its own machine, because a second way to run commands (an image, a desktop, a proxy, snapshots) cost more than it gave. Putting a remote-sandbox layer between the runner and its commands would bring that back: the diff, files, terminal, forks and git all act on the machine directly.

## Decision

Two axes, named apart from the runner:

- **A runner** is the process that connects to the control plane and drives runs. It keeps working on the machine it runs on, as 0219 says.
- **A runtime provider** is how a runner's machine comes to exist and is woken, on the control plane. A VM or a hosted sandbox is a provider that makes a machine and starts `aven runner` on it with a token; the runner connects out as any runner does, so the wire and the runner do not change. `manual` is today's provider: someone installed the runner, so the control plane can only find it connected or not. `RuntimeProvider` in `apps/control-plane/src/modules/runtimes/types.ts`, `manualProvider` in `runtimes/providers.ts`.
- **An agent backend** is what turns a run's prompt into the events of a thread, on the runner. `native` is today's: an Anvia agent journaled by `@anvia/durable`. `AgentBackend` in `packages/runtime-client/src/types.ts`, implemented by `DurableRuns`; the run driver depends on the interface only.

Since the runner and the agent share a machine, a backend such as the Claude Agent SDK or Codex runs beside the runner and uses its own tools there, and Aven does not need a remote-command layer.

## What is not done yet

- No provider other than `manual` and no backend other than `native`. The interfaces are shaped by their one implementation and will change when the second arrives; nothing outside them depends on that shape.
- A runtime does not record its provider: every runtime is `manual`, so `runnerFor` and `botRunnerFor` use `manualProvider` directly. A second provider adds a provider kind and its settings to `runtimes`, and those two find the provider of the runtime.
- A thread does not record its backend, and a runner does not say which backends it offers. Both arrive with the second backend: a thread keeps one backend for its life, as it keeps one runner (0177), and `hello` gains an optional field.
- `RemoteRuntime` starts a run synchronously on a connected runner. A provider that boots a machine needs that start made asynchronous, waiting for the runner's `hello`; until then, a provider is asked only by the calls that already wait: `runnerFor` and `botRunnerFor`, which every call to a thread's or a bot's runner goes through, the computer's wake among them.
- A cloud machine has no folder of its own to serve, so a project on it is a repository that the runner clones (`repo.access`, `git-clone.ts`), which a project can already be.

## Consequences for the backends to come

- The SDK backends call their providers through the model gateway: its base URL and the run's token, as the native one does. A backend states which provider kinds it accepts.
- Aven's own tools (`ask_user`, `request_secret`, `show_artifact`, memory, cockpit, forks) reach an SDK backend through an MCP server the runner hosts for the run.
- What the native backend has that an SDK may not (a run parked on a question, a run taken up after a restart (0024), steering (0098), goals (0022), compaction (0097)) becomes something a backend says it supports, and the platform offers only that.
- The control plane's transcript is the thread's, not the backend's: a backend keeps its own history (a journal, a session file) and files what the thread shows with `memory.append`.
