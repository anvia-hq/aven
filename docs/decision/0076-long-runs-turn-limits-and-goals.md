# Long runs: a larger turn limit, instructions about goals, and a transcript that survives a failure

Status: accepted. Extends 0022 (long-running work is a durable goal) and 0057 (the agent can spawn subagents).

## Context

A thread whose first message was "/setup-env" ran into the agent's limit of 50 model calls and ended with "Reached max turn limit: 50". Two things went wrong. The agent was never told it had a budget or that `define_goal` exists for work that will not fit in it, so it worked until it was cut off. And the runner sent a run's messages to the control plane only when the run ended without an error, so that run's 50 turns, and the prompt, were stored nowhere the thread could read: after a reload the thread was empty, though the work was still in the runner's journal.

## Decision

- **The coding agent and its subagents may take 200 turns** (`CODING_MAX_TURNS`, `SUBAGENT_MAX_TURNS`; they were 50 and 30). A goal's session is one such run, so a goal's total is its sessions times 200. Bots keep their own limits (0058, 0059).
- **The agent is told its budget and when to hand a task to a goal** (`<long_tasks>` in `instruction.ts`, a function of the budget so the numbers cannot disagree with the limit): size a task first, use `define_goal` when it will take more than a quarter of the turns or when past three fifths of them and not close, settle what only the user can give before defining it, write an objective a fresh session can carry on from, and give acceptance criteria and verify commands. `define_goal`'s own description says the same. The agent cannot see a turn counter, so this is judgment, mostly made at the start. Only an agent that has `define_goal` (a run with a person to answer to) is told to hand a task over; a goal's own sessions are unattended and do not have the tool, so they are told only the budget and to end with an account of what is done and left, which the next session carries on from (`codingInstructions(maxTurns, canHandOff)`).
- **A run that fails or is cancelled still files what it did** (`DurableJournal.unfinishedMessages`, filed in `run-driver.ts` before the error is reported). A turn limit leaves the whole conversation in the journal's record, and all of it is filed; any other failure or a cancel files the prompt the run was sent. A run that was interrupted and will be picked up again files nothing yet. A transcript that cannot be filed never replaces the error that ended the run.

## Consequences

- A reload of a thread that hit its limit shows the conversation up to the limit. The error itself is not stored: the control plane learns of it as an event, so after a reload the thread ends without it.
- A failure that is not a turn limit keeps the prompt but not the tool calls that came before it.
- Whether the agent's own memory of the next message includes a failed run's work is Anvia durable's rule (a session continues from its latest completed run), not something this decision changes; the person sees the whole thread, the agent may not.
- 200 turns is a larger bill for a run that loops. Nothing here limits cost other than the turns.
