# A goal session works in tool calls and reports major steps

Status: accepted. Builds on 0022 (goals) and 0076 (the turn limit and handing a long task to a goal).

## Context

A goal's sessions run with nobody answering, and the thread shows every message the agent writes between its tool calls. Told only to be concise (`<tone>`, `<output>`), the agent wrote a fragment before nearly every call: "Need migrations.", "Add tests.", "Commit task 1." The thread read as a column of three-word lines between rows of tool calls, which says little and hides the steps that matter.

## Decision

`codingInstructions` gives an agent that cannot hand a task to a goal, which is a goal's own session and the turn that reports how the goal ended, a `<reporting>` section (`packages/agents/src/instruction.ts`):

- spend turns on tool calls: do not announce a call or narrate each step, and write no fragments between calls;
- write a message only at something major or important: a milestone, a decision that shapes the rest, a surprise, a failure worked around, a blocker;
- give it as one paragraph of two to four full sentences saying what happened, why it matters and what comes next;
- keep the routine out: reading files, a passing check, a small edit, a retry.

A session's closing account of what is done and what is left (`<long_tasks>`) is not limited by this: the next session continues from it. An agent that talks to a person, and subagents (which have instructions of their own), are not given the section; their instructions are unchanged.

## Consequences

- A goal's stretch of the thread is mostly tool calls with an occasional paragraph.
- It is a prompt, so it is a strong nudge, not a guarantee. Watch a real goal after a release and tighten the wording if fragments come back.
- Not measured against a live model when it was written.
