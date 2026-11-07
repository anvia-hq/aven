# 0143: The agent waits for its forks with a tool

Status: accepted. Builds on decisions 0135, 0137 and 0142.

## Context

When the person asks the agent to fork work and then take it, the agent has to be there when the forks finish. Decision 0142 wakes an idle parent, which works but is a new run, on the default model, with the conversation's context only as the history carries it.

## Decision

The agent has `wait_for_forks`, like `wait_for_process` (decision 0137): given the forks' ids, it returns when none is working any more (done, failed, or stopped to ask the person), or after up to 240 seconds, with each fork's state and the end of its last message. The agent calls it again while some still work, then takes each fork's changes. The thread shows it as "Waiting for forks", not a sleeping command.

- The prompt says to use it when the person asked for the work to be taken, and not to `sleep`.
- The wake-up of decision 0142 stays for an agent that ends its turn with forks going.
- A look at a fork reads its history, so the tool looks every five seconds, not every second.

## Consequences

- The agent keeps its own model and context through the wait, and a person sees one continuous turn.
- A turn can last as long as the forks take; the person can still stop it.
