# A runtime's machine is persistent or ephemeral

Status: accepted. Adds to 0220. Nothing here is built: it settles where a thread's work lives on a machine that stops by itself, before the first provider that makes one arrives.

## Context

0220 names a runtime provider: how a runner's machine comes to exist and is woken. The machines providers make do not all live alike:

- **A persistent machine** stays up until someone stops it, with its disk. `manual` is one: someone installed a runner, and it is connected or not. A plain cloud VM is another.
- **An ephemeral machine** is stopped by its provider after some minutes idle, or at a cap on how long it may be awake, and comes back when asked. Hosted sandboxes such as Vercel Sandbox are, and so is a VM that stops itself when idle. What survives a stop depends on the provider: the disk, a snapshot, or nothing.

What matters is how the machine lives, not what the product is called, so the two kinds are named by that: a persistent runtime and an ephemeral one.

What a thread has on its runner's machine is its folder, with the files and git history the agent made, and the runner's journal (`runs.db`, 0021) with the state file beside it (0024). Everything else is kept by the control plane: the transcript, memory, cockpit, variables, the model gateway.

## Considered: the agent in the control plane, the machine only a workspace

The agent loop would run in the control plane's built-in runner, and only commands and files would go to the sandbox, through its provider's API. A sandbox that stopped mid-run would lose nothing of the run.

Rejected. The diff, the files, the terminal, processes, forks, git, uploads and artifacts all act on the runner's disk directly (`host-git.ts`, `folder-contents.ts`, `fork-workspace.ts`, `artifacts.ts`, `ThreadWorkspaces`). Each would need a second version that goes through every provider's API, which is the second way of running commands that 0219 retired. The built-in runner would also carry every workspace's agent loops, on the control plane's machine.

## Decision

- **A provider is persistent or ephemeral**, and that decides how many threads a machine holds:
  - **A persistent runtime is one machine for many threads**, as every runtime is today. `manual` and a plain VM are. The control plane does not stop it, and a project on it may be a folder of the machine (0218) or a repository.
  - **An ephemeral runtime is one machine per thread.** The runtime is a template: the provider and its settings (account, region, machine size). Each thread gets a machine of its own from it, made when the thread first needs one, and removed when the thread is archived (0118) or deleted. A project on it is a repository, cloned into each thread's machine (`repo.access`, `git-clone.ts`), since a folder lives on one machine only.
- **An ephemeral provider says how its machines live:** what survives a stop (the disk, a snapshot, or nothing), how long one may stay idle, and the cap on how long it may be awake, if it has one.
- **The runner stays on the machine for every provider**, as 0220 says. The SDK backends run beside it. A provider makes a machine and starts `aven runner` on it, which connects out, and the wire does not change.
- **A thread's state on the machine is its folder and the journal**, so a provider must keep the disk, or a snapshot of it, across a stop. A provider that keeps nothing cannot hold a thread that goes on after its machine stops, and is not offered until there is a way to save a folder somewhere else.
- **The machine is kept awake while it is needed:** while a run is going, a process the agent left running, a terminal is open, or a fork is waiting. The runner knows the processes and the terminal (`hasRunningProcesses`, `IdleRelease`). The control plane knows the runs. While any of these holds, the control plane asks the provider to keep the machine awake. Once none does, it lets the machine stop after the provider's idle time.
- **Reading a thread does not wake its machine.** The transcript, usage and the thread list come from the control plane. Something that needs the disk wakes the machine only when the person asks for it: opening the files or the terminal, or sending a message. Otherwise it says the computer is asleep (`ComputerState` `asleep`, `waking`, `awake`, and `computer.wake`, from 0219).
- **Waking is reaching the runner.** `reachRunner` asks the provider to start the machine, then waits for its runner's `hello`, with a time limit after which the runtime is offline. This is why `Runtime.start` and `resume` are asynchronous and `RunManager` holds the thread meanwhile (0220).
- **An ephemeral runtime's runner is reached by its thread.** Today the hub keeps one connection per runtime. A runner on an ephemeral machine connects with a token for its runtime and its thread, the hub keeps its connection by thread, and `reachRunner` is given the thread for an ephemeral runtime.
- **A machine that is stopped mid-run is a runner restart.** When its cap ends a run, the control plane wakes the machine again, and the runner rejoins the run from its journal as it does after a restart (0023, 0024). The processes the agent had started do not come back, which the computer tools already tell it.

## What is not decided yet

- **Forks and continuations on an ephemeral runtime.** A fork copies its parent's folder on the same disk today (`fork-workspace.ts`). On an ephemeral runtime the fork has a machine of its own, so its folder has to come from the parent's another way, such as a branch the parent pushes or a snapshot of its machine.
- **Bots.** A bot's computer is a runtime's machine. Whether a bot may use an ephemeral runtime, and with which machine, is chosen when one does.
- The idle time and the time limit for waking, per provider.
- What the platform shows while a machine is waking, and how much a workspace may spend on machines.
