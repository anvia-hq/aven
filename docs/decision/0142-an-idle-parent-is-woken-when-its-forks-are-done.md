# 0142: An idle parent is woken when its forks are done

Status: accepted. Changes one rule of decision 0135.

## Context

Decision 0135 told a working parent when a fork ended and left an idle one alone, so that no agent acts unasked. In use, the person asks for the whole job ("spawn four threads, then take the diffs and open a pull request each"), the agent starts the forks and ends its turn, and nobody collects the work: the person has to come back and say so.

## Decision

- When a fork's run ends and the parent is idle, the parent is woken **once**, by the last of its forks to stop going, with one `[fork]` note that names every fork that is not archived.
- The note tells it to take the work and open pull requests if the person asked for that, and otherwise to say the forks are done and ask. A working parent is still told of each fork at its next step.
- The agent is told that it will be woken, so it ends its turn instead of polling, and is told not to promise forks past the limit of three.

## Consequences

- A person who only wanted to explore with forks costs one short run when they finish.
- A fork that stops to ask the person a question counts as ended; the note says so.
