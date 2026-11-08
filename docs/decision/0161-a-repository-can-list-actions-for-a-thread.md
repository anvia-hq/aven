# A repository lists actions that a thread can run

Status: accepted. Builds on 0071 (Background tasks), 0083 (what Ship waits for) and 0069 (the ship prompt).

## Context

Running the tests or the typecheck from a thread meant typing it to the agent, which costs a run, or opening the Terminal. A person asked for shortcuts a repository defines, shown next to Ship.

## Decision

- **`.aven/actions.yml`** in the thread's workspace lists up to 12 actions, each with a `name` (40 characters) and exactly one of `run` (a shell command, 2,000 characters) or `prompt` (a message for the agent, 10,000). Names are unique. A file that does not parse shows no buttons and a note that says why, in place of them.
- **A `run` action starts a background process in the thread's sandbox** (`actions.run`, wire version 51), waking the sandbox when it is off, and nothing else: it is not a run, costs no tokens and may be started while the agent works. Its output and exit code are the thread's Background tasks (0071), which already list, read and stop processes. It never wakes the agent when it ends: the runner marks it as told, unlike a process the agent started (0144).
- **A `prompt` action sends the agent its text** as the person's message, with the composer's model choice, the way Ship does, and is off while the agent works.
- **The platform sends only the action's name.** The control plane reads the file again through the runner and runs what it finds, so a client cannot run a command the repository does not list.
- **Only the thread's creator** sees and starts actions, as with Ship.
- **A command that exits with a code other than 0 has an Ask agent to fix button** in Background tasks, which sends the agent the command, its exit code and the end of its output (6,000 characters). It is off while the agent works.
- **The first two actions are buttons beside Ship**, the rest are in a menu.

## Consequences

- A runner needs `aven update` for `actions.run`; an older one is refused by the wire version.
- Like Ship's files, the actions are the thread's own workspace's: a thread has them once the file is in its checkout.
- The command runs as the agent's commands do, in `/workspace`, with the project's environment variables and the secrets hidden from its output.
