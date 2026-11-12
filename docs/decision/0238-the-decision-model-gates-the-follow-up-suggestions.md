# The decision model gates the follow-up suggestions

Status: accepted.

## Context

Decision 0226 asks the person's small model for suggested replies after every finished agent reply. Many replies leave nothing predictable to say ("Done.", a plain answer), so most of those calls cost tokens and show buttons nobody needs.

## Decision

- **A free rule runs first.** A reply shorter than 40 characters gets no suggestions and no model call.
- **Then the workspace's decision model** (decision 0191) answers one choice, `suggest` or `skip`, over the same transcript the small model would get (`followUpDecider` in `decision-model/jev.ts`). The small model is asked only when the `suggest` share is at least 0.5.
- **Any doubt suggests, as before.** With no decision model, with one whose key cannot be read, or one that fails or takes more than 3 seconds, the gate lets the suggestions through. A missing button costs more than a wasted call.
- **The gate runs before the small model**, so the buttons can arrive up to about 3 seconds later. Running both at once would hide that and save no tokens, so they stay in sequence.

## Consequences

- The last few messages of a thread go to the workspace's decision-model provider as well as to the person's small model; multiplayer messages already go there.
- The 0.5 threshold is a first guess and should be tuned on real replies.
- The gate is only as good as the decision model's judgment, which tests with a fake model cannot show.
