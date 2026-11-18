# The agent works quietly and closes in a few sentences

Status: accepted. Builds on 0051 (the instructions are tagged sections) and 0134 (a goal session reports major steps).

## Context

0134 stopped a goal session from writing a fragment before every tool call, but only a goal's own session got the `<reporting>` section. An agent in a normal thread was told to "be concise" in `<tone>` and `<output>`, and other sections pulled the other way: `<proof>` asked it to quote the lines that matter, `<delivery>` asked it to offer the long-term fix and name what it would take, and `<output>` asked for what changed, how it was checked and anything unverified with no limit on length. The result was a line of commentary between tool calls and a long closing message that recapped the steps.

## Decision

In `packages/agents/src/instruction.ts`:

- `<tone>` gains one rule: work quietly, because the user sees every tool call; speak mid-run only for a surprise, a change of plan or a blocker.
- `<output>` says to start with the result, then at most a few sentences (what changed and why, the proving command with its result line, what could not be verified), with no recap of steps, no restated request and no offer of more help. A question, plan or design ask gets the decision and the one reason that matters.
- `<proof>` asks for one result line, not every line that matters, and mentions what could not be checked only when there is something.
- `<delivery>` keeps the long-term-fix rule in one sentence.

Rules were shortened where they conflicted, not added on top of them: a longer prompt dilutes every rule in it.

## Consequences

- Threads are shorter, with the tool calls carrying the work.
- It is a prompt, so it is a strong nudge, not a guarantee. It was not measured against a live model when written: read a few real threads (a small fix, a design question, a ship) and tighten the wording if the commentary comes back or the closing message loses something the user needed.
- The goal session's `<reporting>` and the closing account in `<long_tasks>` are unchanged.
