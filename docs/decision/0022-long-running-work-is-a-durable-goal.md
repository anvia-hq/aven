# Long-running work is a durable goal

Status: accepted. Builds on [0021](0021-runs-go-through-anvia-durable.md).

## Context

A run is bounded by the agent's step limit and its model's context window. Large work (a feature, a migration, a refactor) needs many edit-and-verify cycles. `@anvia/durable` has `defineGoal`: a controller that runs working sessions one after another and asks trusted code, after each, whether the goal is met.

The harness this was modelled on moved away from `defineGoal` because the goal's work ran in a separate conversation and was invisible in the chat. Here the sessions' events are forwarded into the thread's run, so a person watches the work as it happens.

## Decision

- **`define_goal`** (`@aven/agents/tools/define-goal`) is a tool of the attended agent only: an objective, acceptance criteria, optional `verifyCommands` and `maxSessions` (default 20). It records the goal and returns. The agent is told to end its turn.
- **The goal starts when that turn ends.** The wire run stays open: the runner works the goal, then runs one more turn so the agent reports on it in the thread, and only then sends `run.end`. The wire is unchanged (still version 8).
- **Sessions are unattended.** The goal's sessions and the report turn are built with `attended: false`: no `ask_user` (nobody is there to answer) and no `define_goal` (no goals within goals). A goal that cannot go on pauses and says why in the report.
- **Trusted code decides, not the model** (`goal-assessment.ts`). After each session the verify commands run in the thread's sandbox, in order, each with a five-minute limit. All pass: complete. Any fails: continue, with the failing output as the next session's task. The same failure three times in a row (a digest of the failing output) is no progress and pauses the goal. A session that ran out of steps continues without checking. Without verify commands the goal completes when a session ends on its own: the agent's word, and the report says so.
- **Sessions continue one conversation** (`rounds: "continue"`), so nothing is lost between them. Each session's run is followed for its text, tool calls and usage, which reach the client like any run's.
- **The goal's work is in the transcript, the notes to the agent are not.** Each session's messages are filed with `memory.append` without the prompt Aven wrote; the report turn is filed without the note that asked for it. The note is in the agent's history, so it knows what happened when the user writes next.
- **Stopping.** A cancel stops the goal and ends the run with the cancel reason. A goal that pauses (blocked, out of sessions, no progress, a failed session) is cancelled in the journal: nothing resumes it.

## Consequences

- A goal does not survive a runner restart. Its agent, its sandbox handle and its assessment live in the runner's process; on restart the journal ends interrupted runs (0021) and an unfinished goal task stays in the journal, unused. Continuing goals across a restart needs the control plane to keep runs alive across a reconnect.
- Verify commands are written by the model and run in the thread's sandbox, with the same reach as any command the agent runs there.
- A goal's sessions are one long reply, with a "Goal · session N" divider between them. The divider is ordinary assistant text, live and in the filed transcript, so no client needs to know about goals; it is not in the agent's own history.
- The goal's sessions use their own conversation, so the thread's history has the objective, the agent's report and nothing of what the sessions did except through the report.
