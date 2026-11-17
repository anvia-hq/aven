# Every agent is given the repository's instruction file

Status: accepted. Adds to [0220](0220-runtime-providers-and-agent-backends.md).

## Context

`AGENTS.md` (or `CLAUDE.md`) is where a repository says how it is built and checked, and `/setup-env` tells people that a line in it makes every agent that works there run `.aven/setup`. Only the Codex agent did: the Codex CLI reads it from the workspace itself. The Claude agent runs with `settingSources: []`, so the Claude Agent SDK loads no `CLAUDE.md`, and nothing in Aven read the file for the native agent.

## Decision

- **The runner reads `AGENTS.md` from the workspace root, `CLAUDE.md` when there is none**, cut at 32 KiB (`packages/agents/src/project-instructions.ts`), and adds it to the system prompt of the native and Claude agents in a `<project_instructions>` block. Codex keeps loading it itself, so it is not added twice.
- **It is information from the repository, not the person.** The block says it never overrides Aven's rules or what the person asks and grants nothing, and the closing tag is stripped from the text, as for memory notes.
- **A run does not wake the computer for it** (0128, 0180). The Claude agent already waits for the computer, so it reads the file. The native agent reads it only when the workspace is already there; when it is not, its prompt says to read the file before changing code, since a native run starts at once and its tools wait for the sandbox.
- Only the root file is read. A nested `AGENTS.md` is not, which Codex does for its own.

## Consequences

- A project's `AGENTS.md` applies to all three agents, as the setup skill says.
- A cloud thread's native agent on a sandbox that is not up yet depends on the model following the pointer, until the first tool call has woken the sandbox.
