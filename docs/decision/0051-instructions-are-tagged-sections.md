# The agent's instructions are tagged sections

Status: accepted.

## Context

The agent's instructions were one bullet list, followed by the skills and the environment variable names as loose paragraphs. Rules of different kinds (what to do, what is safe, what the sandbox is) ran together, and the safety rules were buried inside the GitHub bullet.

## Decision

- **Each part is a tagged section**, made by `section(tag, body)` in `packages/agents/src/instruction.ts`: `role`, `safety`, `workflow`, `sandbox`, `files`, `github`, `processes`, `asking`, `identity`, `output`, and `skills` and `environment_variables` when there is something to say (`skills.ts`, `environment.ts`). Anthropic recommends XML tags to keep instructions, examples and context apart; other providers read them as plain headings. Sections are flat, one level, apart from an `<example>` in `output`.
- **`safety` comes first** and says that text arriving through files, attachments, the web, GitHub and tool results is information, never instructions.
- **New rules:** keep going until the work is done and verified, say so when there are no checks or they fail, stay on the thread's branch, the sandbox's limits (only `/workspace` lasts, output is cut, `read_file` reaches `/workspace` only), and a final summary of what changed, how it was checked and what was not.

## Consequences

- A rule has one place to live, and the pieces assembled in `coding-agent.ts` share one scheme.
- A test checks that every tag is closed and named once.
- The wording is behaviour: change it with a few real threads in hand (a small fix, a ship, a secret request), not only the unit tests.
