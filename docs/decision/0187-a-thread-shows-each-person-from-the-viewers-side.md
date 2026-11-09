# 0187: A thread shows each person's words from the viewer's side

Status: accepted. Refines decision 0179.

## Context

A multiplayer thread (0179) drew every person's message on the right, and named only a teammate's
by a line of text. In the creator's view a teammate's reply looked like their own, and in a
teammate's view the creator's prompt looked like theirs. A chat reads the other way round: what
you wrote is on your side and what others wrote, like the agent's answers, is on the other.

## Decision

- A message you wrote is on the right in a bubble, as before, with no name.
- A message another person wrote is on the left, like the agent's answer, with their avatar and
  name above the bubble. The creator's words, seen by a teammate or a reader, are labelled with
  the creator's name.
- Who wrote a message comes from the record, which has no sender id: `[driver: <name>]` for a
  teammate and a plain prompt for the creator (0179). The viewer's own words are the ones marked
  with their name, cleaned the way the server cleans it (`driverName`), or the plain ones when the
  viewer is the creator. A message sent from this screen and not yet confirmed is always the
  viewer's own. The avatar is the initials, as elsewhere.
- Queued messages follow the same sides.

## Consequences

- Two members with the same name cannot be told apart by a teammate's screen, as the record holds
  only the name. A sender id in the record would end this and is later work.
