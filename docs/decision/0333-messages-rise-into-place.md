# Messages rise into place and the view glides to your own message

Status: accepted

## Context

A sent message, a queued steer and a new agent answer appeared with no transition, the Send button snapped into Stop, and sending jumped the view to the bottom. It felt jagged.

## Decision

- A user message that is still being sent, a queued steer and the answer that is streaming rise into place (`rise-in`: 200ms, 6px, `ease-out-strong`, off for reduced motion). Messages already in the thread when it opens do not animate.
- Send and Stop are one button whose two icons crossfade and scale.
- When the person sends, the conversation glides to the bottom (`scrollTo` smooth, settled on `scrollend` or after 600ms). Streaming keeps following instantly, in small steps, as before. Reduced motion keeps the instant jump.

## Consequences

Messages from other participants arrive without the rise, because the thread cannot tell them from history when it opens. Only CSS and the existing scroll hook change; no dependency is added.
