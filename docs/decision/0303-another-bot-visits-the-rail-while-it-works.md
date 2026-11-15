# Another bot visits the rail while it works

Status: accepted. Adds to the rail 0111 decided, which holds the Aven mark, the main bot and the cockpit.

## Context

The rail held the person's main bot and nothing else. A second bot working — one the main bot made, or one a schedule started — gave no sign in the frame: its answer waited in a page the person had no reason to open. The person asked for a bot that is working to appear in the rail, and to stay there until it is opened.

## Decision

- The main bot keeps its place in the rail whatever the other bots do, and never gets a second entry.
- Another bot appears under it while it works, drawn as it is elsewhere in the app, with its eyes open while it works.
- A bot that stops working stays there, idle, until the person opens it. Opening it is its page becoming the route, from this entry or from its row in the bot sidebar, and the entry goes at that moment.
- A bot that is opened while it still works stays until it finishes, and the entry goes when it does: a bot being looked at does not need to announce itself afterwards.
- A bot that works again after being opened shows again.
- Entries keep one per bot, in the order the bots started working.
- What has been opened is kept in memory for the life of the tab, and cleared when the person signs out. Nothing is stored on the server and nothing survives a reload, since the server says only which bots are working now.

## Consequences

Several bots working at once make the rail longer; each entry takes the same target, avatar size and tooltip as the main bot's, and its order does not move while the others come and go. A phone has no rail, so it sees none of this and keeps the Bot tab as it was. A bot deleted while its entry waits simply stops being drawn, since the rail draws only bots the list knows.
