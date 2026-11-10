# The space between messages follows who spoke

Status: accepted. Replaces the margins of user messages (788bb4f2, 0187).

## Context

In a thread of several people the same gap sat between every two messages, so a person's three short bubbles read as three separate remarks, and the agent's answer was no farther from a question than the next bubble.

## Decision

- Two bubbles in a row from the same person are 4px apart, and the author's name and avatar show once, over the first.
- The agent and any person are 64px apart, in either order.
- Two different people, or two messages of the agent, are 16px apart.
- Who spoke is told by `speakerOf` (`message-spacing.ts`): the role, the sender (`senderId`, or the `[driver: Name]` mark) and the viewer. Messages that draw nothing (a process note, an empty answer) are skipped, and a note counts as the agent.
- The list has no gap of its own: each item carries the space before it.

## Consequences

- A queued message, a message being sent and a stored one are spaced the same way.
- A person is told apart by name when there is no sender id (an old thread), so two people with the same name would be read as one.
