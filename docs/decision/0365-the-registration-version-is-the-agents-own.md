# The registration version is the agent's own

Status: accepted. Supersedes the hand-kept constant in [0035](0035-the-agent-has-skills.md) and the "do not bump the registration version" note of [0112](0112-durable-owns-model-retries.md).

## Context

A durable registration carries a version, and a run recorded under one version refuses to continue under another. Aven kept it as the constant `AGENT_VERSION = "2"` in `packages/runtime-client/src/durable-runs.ts`, bumped by hand, and the decisions above leaned on that: a parked or interrupted run could always be taken up again, because the version never moved.

The cost is the other half of the same fact. Nothing notices when the agent's model, instructions, tool definitions or output schema change. A run parked before a deploy that rewrote `codingInstructions`, or that renamed a tool, continues afterwards against a configuration the model never started with — silently, because replay only compares the operations it recorded, not the agent that produced them.

`@anvia/durable` 0.18 can derive the version from the agent itself: `agentVersion(agent)` hashes the model, instructions, sampling settings and controls, tool definitions, provider tools and output schema, and returns `auto-<16 hex>`. It is identical across processes and restarts. `open()` and `DurableWorker.start()` accept `version: "auto"`; every other path takes the awaited hash.

## Decision

- `DurableRuns` registers each agent with `await agentVersion(agent)` instead of the constant. The constant is gone.
- Because the version is now computed, `#register`, `#registerOrKeep` and the goal journal's `registerOrKeep` return promises; the call sites (a run's start, a question's answer, a rejoin, a goal's first registration) await them.
- A run whose agent's declared configuration changed under it now ends `needs_attention`, with durable's own message ("The saved agent version is not registered: the agent's declared configuration (model, instructions, tools, or settings) changed since this run started. Restore it before retrying."), instead of continuing against the new configuration.
- What the version does not cover stays uncovered: tool implementations, guardrails, middlewares and lifecycle hooks are code durable cannot read. MCP servers, tool indexes and context have fingerprints of their own; aven's MCP servers reach the agent as ordinary local tools, so their definitions do land in the version.

## Consequences

- A restart that reloads the same code resumes as before: the hash is stable across processes, and a test answers a question parked by an earlier process.
- Every deploy that changes an instruction or a tool definition strands the runs parked across it. That is the intent — replaying a changed agent is the failure being refused — but it is a real cost: the person answers a question and the run fails instead of continuing, and `retry()` cannot help. A run that must survive a deploy is a reason to keep its instructions stable, not to move the version back to a constant.
- A diff that changes what an agent is told is now a change to the runs in flight, not only to the next one. Reviewing instructions and tool descriptions is reviewing durability.
