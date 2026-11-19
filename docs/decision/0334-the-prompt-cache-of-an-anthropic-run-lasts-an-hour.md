# The prompt cache of an Anthropic run lasts an hour

Status: accepted.

## Context

The native agent asks Anthropic to cache the prompt. That cache lives for 5 minutes after its last use (the default; `ttl: "1h"` asks for the extended one). A thread is a long conversation with pauses: a person reading the answer, a background watch waiting on CI. After a pause of more than 5 minutes the next call writes the whole prompt to the cache again instead of reading it.

One production thread of 353 model calls showed it: 28 calls rewrote the whole prompt (up to 317k tokens), 4.14M of its 4.62M cache-write tokens. At list prices a cache write costs 12.5 times a cache read.

## Decision

- **The cache lasts one hour** (`ttl: "1h"` as `promptCache` in `createModel`, `packages/agents/src/model.ts`). A write costs 2 times the base input price instead of 1.25, a read is unchanged.
- **The breakpoints are the adapter's** (`@anvia/anthropic` 1.3): one on the last tool definition, one on the system prompt, one on the last cacheable block of the conversation, instead of the request-level `cache_control` that asked the API to cache and move a breakpoint on its own. The two cover the same prefix; the four-breakpoint cap is the API's.
- It applies to the `anthropic` provider only, for the native coding agent and for bots. Other providers are unchanged.

## Consequences

- A pause between 5 minutes and 1 hour no longer costs a full rewrite. A pause longer than an hour still does.
- The first write of a thread and each incremental write cost more, so a thread that never pauses for more than 5 minutes pays slightly more than before.
- The compaction summary still misses the cache: `@anvia/core` sends the history as one text prompt with its own instructions, a different prefix from the run's. Not changed here.
