# 0280: The Claude backend is its own package

Status: accepted.

## Context

`packages/runtime-client` held the runner and both agent backends. About ten `claude-*.ts` files and their tests sat beside the runner code, and `@anthropic-ai/claude-agent-sdk` was a dependency of the whole package. Moving the Claude files out on their own would have made two packages import each other, because they used the runner's shared types.

## Decision

- **`@aven/agent-backend` holds the contract.** The backend interface (`AgentBackend`, `AgentBackendSet`), the run input, event and Claude query types, `runner-secrets` and the journal-path test helper moved there. It depends on `@aven/protocol` and `@aven/agents`, not on the runner.
- **`@aven/claude` holds the Claude backend.** All `claude-*.ts` sources and their tests, including `claude-binary`, its manifest and the live download test. It depends on `@aven/agent-backend`, `@aven/protocol` and `@aven/agents`, and owns `@anthropic-ai/claude-agent-sdk`.
- **`@aven/runtime-client` still picks the backend.** `agent-backends.ts` imports `@aven/claude`. The three tests that drive the Claude backend through the run driver, outbox and records stay in the runtime client as `agent-claude-*.test.ts`, since `@aven/claude` must not depend on it.
- These are moves and import rewrites. No behaviour changed.

## Consequences

- Imports of the Claude files are now `@aven/claude/<name>`.
- Both packages are listed in the Dockerfiles' `COPY` lines.
- The runner packages and the CLI still bundle the SDK through `bun build --compile`, now via `@aven/claude`.
