# A subagent is one line, and a task that names no type explores

Status: accepted. Supersedes part of decision 0057 (which drew a subagent's type, the tool it was on, and its tools and answer behind a chevron).

## Context

Decision 0057 gave each subagent a card with its description and type, the tool it was on while it worked, and, opened, every tool it called and what it sent back. In practice a subagent makes dozens of calls — three explorers came back with 50 each, which is the most the card keeps — so the line under a name read `explore · 50 tool calls` and the chevron led to a list nobody read. The agent has already read the subagent's answer and is the one that reports it: what the person wants from the row is which subagents are working and how they ended.

The same screen showed the other half. `spawn_agent` took `{ description, prompt, type }` and `type` was required, so a model that forgot it had its call rejected, and the cards it had drawn said nothing at all about why. A small model did it twice in a row.

## Decision

- A subagent is one line (`subagent-card.tsx`): the description, with the spinner, the tick or the cross beside it, and, for a subagent that failed, the one thing that explains it — why. Its type, the tool it is on, every tool it called and its answer are no longer drawn. The run events and the tool part still carry them (decision 0057 keeps its wire), so a client that wants more still has it.
- `spawn_agent`'s `type` defaults to `explore` (`subagents.ts`, `DEFAULT_SUBAGENT_TYPE`). A task without one explores, which is the reading type, and the model no longer learns a schema rule at the price of a turn. `general` stays a deliberate choice.
- The card and the stored transcript agree: a task that named no type is projected as `explore` (`tool-projection.ts`), so the row a client draws from the input its model sent reads the same as the one built from the result.

## Consequences

- Nothing on the row shows which tools a subagent ran; the run events still carry them, and decision 0057 still says why they exist.
- A subagent that failed keeps its reason on the line, since the line is now the whole card.
- A model that means `general` and says nothing gets `explore`, which can only read. That fails a task safely, and the parent sees why.
