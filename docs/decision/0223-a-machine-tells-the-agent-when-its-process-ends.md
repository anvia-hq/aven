# A machine tells the agent when a process it started there ends

Status: accepted. Adds to 0222, 0144 and 0147.

## Context

0222 runs the native agent in the control plane. A process it starts on a machine is started there, through `machine.call`. The watch that sends `process.ended` (0144, 0147) arms only when a run starts on that runner, and the control plane accepts `process.ended` only from the thread's own runtime. The machine has no run of the thread, so a process the agent left running ends in silence.

The built-in runner cannot watch it instead. After the run it can no longer call the machine, and a `process.ended` from the built-in runner is not the thread's runtime, so the control plane would refuse it.

## Decision

- The machine watches with the same `ProcessEndWatch` as its own runs. Preparing the computer, or starting a process, arms it once the processes already there are the baseline, and the thread counts as having a run until the control plane says that run ended. A process the person stops is still not told of: that stop already goes to this runner, which ignores it.
- When the run ends, the control plane tells the machine with `process.watch`. `settle` when it ended with a response, so a process that ended in the gap is told at once and the watch stops if nothing is still running. `suspend` when it stopped, failed, is waiting for an answer, or the run is lost: nothing is told while the thread waits, and the next run follows a process still running. That is the split the runner already makes for its own runs.
- The call does not wake a machine that is not connected. It waits, and is sent when the machine says hello. A run on the machine's own agent is unchanged, and the built-in runner does not also watch a thread whose computer is another machine.

## Consequences

- A runner from before this answers `process.watch` with "Unknown call". A process the agent starts on it is not told of until that runner is updated, as with `machine.call`. The wire version stays 56.
- A machine that restarts while a process is running picks the watch up the next time the agent prepares the computer, from what the watch had stored. Until then an end is not told of, as when a runner restarts.
- A question, a failure or a cancel still holds the news for the next run. Telling at once would be refused while the thread waits for an answer, and the agent would never hear it.

## Considered

Arming only when a process starts, and never settling or suspending. A process that ends while the person is answering would try to start a run, the note would be refused, and the watch would have already marked it told.

Telling the machine from the built-in runner, over `machine.call`, at the run's start and end. The run is already out of that runner's live set when it finishes, which is what lets its own watch stop, so it can no longer call the machine. Arming at the start would also reach the machine before a tool needs it.
