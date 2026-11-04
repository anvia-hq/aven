# Durable owns model retries

Status: accepted.

## Context

`resolveAgentModel` gives coding agents and bots a five-attempt retry policy. Durable has always disabled agent-level retries and used the registration's `modelRetry`, so its attempts are journaled and recovery never repeats an unrecorded request. Anvia durable 0.13.0 now rejects an agent whose own policy would retry instead of silently ignoring it. Without adapting the factory, every normal thread would fail when registered.

## Decision

- The coding-agent factory accepts a typed `retries` override. With no override it keeps its existing five-attempt policy.
- `defaultCreateAgent` passes `retries: false` for journaled coding agents. `DurableRuns` retains its existing registration-level policy of five attempts, starting at one second and capped at thirty seconds.
- Plain subagents, identified by `role`, keep agent-level retries because they run outside the journal. Bots use their separate factory and are unchanged.
- The explicit compaction agent already has no agent-level retry policy; durable owns its summary retries too.
- Do not bump the agent registration version: effective execution, tools and instructions are unchanged, so existing parked runs can continue.

## Consequences

Retries have one owner in each execution path. A provider-boundary regression builds the production factory, gives its local gateway one transient failure, and checks that both a journaled thread and a plain subagent finish after two requests. The concurrency patch remains independent and is regenerated for durable 0.13.0.
