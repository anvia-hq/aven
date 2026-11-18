# The overview cards are as round as the composer

Status: accepted. Refines the cards inside a thread's side panel (decision 0054).

## Context

The column beside a thread is a stack of cards: Environment, Context, Usage, Limits and Background tasks. They were `rounded-lg`, while the composer just below the conversation is `rounded-3xl` — two kinds of surface on one screen with visibly different corners. Nothing had chosen that: the cards were written before the composer took its shape.

## Decision

- **`OverviewCard` is `rounded-3xl`**, the composer's radius (`components/prompt-input.tsx`, and the bot composer after it), so every card of the column is as round as the composer: Environment, Context, Usage, Limits and Background tasks.
- **The radius lives in that one component**, so a card added to the column inherits it rather than picking its own.

## Consequences

- The column reads as part of the same surface as the composer, at the same distance from the frame.
- A thread's side panels keep their own `rounded-xl` (decision 0054): they are frames on the page, not cards inside one.
