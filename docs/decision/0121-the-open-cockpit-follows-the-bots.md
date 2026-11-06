# The open cockpit follows the bots

Status: accepted. Adds to 0109 (agents work the cockpit) and 0064 (which bots are at work).

## Context

A bot adds and changes the person's inbox, tasks and notes, but the cockpit keeps each list in an atom, loaded once, so what a bot did showed only after a refresh of the page.

## Decision

- The cockpit's sidebar (`hooks/use-bot-changes.ts`) follows `GET /bots/working`: when the set of bots at work changes, which includes a bot finishing, the three lists and the tags that were loaded are fetched again, and again every five seconds while any bot works.
- A list with a change of the person's own not yet saved is left alone for that round, so the server's older copy does not undo it on screen.

## Consequences

A change a bot makes shows within a few seconds, with no new event on the wire. A bot working at nothing to do with the cockpit still causes a fetch every five seconds while the cockpit is open.
