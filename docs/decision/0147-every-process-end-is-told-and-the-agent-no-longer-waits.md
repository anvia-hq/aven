# 0147: Every process end is told, and the agent no longer waits for one

Status: accepted. Supersedes decision 0137 (the `wait_for_process` tool, removed) and widens decision 0144, which only told of a process that ended while the thread was idle.

## Context

The agent kept using `wait_for_process`, which holds the turn open and shows the thread as working. The reason was a gap in 0144: it watched only the processes still running when the run ended, so a process that ended before the agent's turn did was never told of. An agent that ended its turn on "I will carry on when it finishes" could wait for ever, so waiting with a tool was the safe thing to do. Claude Code has no waiting tool: the agent starts the command in the background, ends its turn, and is told when the command ends, at once if it is still working and by starting it again if it is idle.

## Decision

- The runner watches a thread from the start of every run (`ProcessEndWatch.arm`), looking every three seconds, for the processes the sandbox did not have when the watch began: they are told apart by process id, never by a clock, since the sandbox's clock is not the host's. A process that ended between two looks, or before the run did, is told of too (`settle` looks at once when the run ends normally).
- `process.ended` is sent when any of them ends, whether the thread has a run or not. The control plane sends the note as before (`messages.send`, not the person's word): a run that is going takes it at its next step as a steer, an idle thread starts a run with it.
- The watch ends when the thread has no run and none of its processes is running. A run that is stopped, fails or stops for a question only suspends it (`suspend`): nothing is told while the thread waits, and the next run follows a process still running and tells of it if it ended meanwhile. A process the person stops is not told of.
- `wait_for_process` is removed from the agent's tools, and the instructions tell it to start a long job in the background, say what it will do when it ends, and end its turn. A transcript that used the tool is still drawn. `wait_for_port` stays for a server that never ends, and `read_process_logs` and `list_processes` look without waiting.

## Consequences

- An agent that already read a process's end may get the `[process]` note too; the note says so.
- A runner that restarts forgets what it watched (the same as before).
- `wait_for_forks` (decision 0143) is unchanged; the idle parent is woken when its last fork ends (decision 0142).
