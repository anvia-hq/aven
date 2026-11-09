# Teammates drive a thread while multiplayer is on

Status: accepted. Builds on 0084 (a thread is its creator's, shared to read), 0098 (a message sent while the agent works steers it), 0020 (the agent's question), 0044 (a run acts as the sender's GitHub account), 0049 (identity tokens) and 0063 (a message that comes from another is marked `[from ...]`). Modelled on Amp's multiplayer threads.

## Context

A thread shared with the workspace (0084) can be read by every member and driven by one person, its creator. Teams want to join a thread: add a prompt, steer the agent, answer its question. Amp does this with an explicit, time-limited mode. Its owner turns multiplayer on for 7 days, teammates then prompt the thread, the owner's credentials and billing are used, and integrations that act as the owner stay off unless the owner allows them.

A run is sent as one person: their model provider and key, their GitHub account (commits and pull requests), their personal variables, MCP servers, skills, memory and cockpit, and an identity token carrying their email. Letting a second person send a run must not lend them any of that without the owner's say.

## Decision

- A thread has `driving_until`, a timestamp. While it is in the future, multiplayer is on; null or past is off. Only the creator turns it on or off (`PATCH /threads/:id` with `driving`: a number of days from 1 to 30, or `null`), only on a thread shared with the workspace, and a thread made private again ends it. It lapses by itself and is never extended by use.
- While it is on, any member of the workspace may, on that thread: send a message (which steers a run that is going, 0098), answer the agent's question, and stop the run. They may not archive it, change its title, visibility or driving, ship, continue it elsewhere, compact it, or open its terminal or desktop. These stay the creator's (`thread: "drive"` in `access.ts` for the first three, `own` for the rest).
- A driver's message runs as the creator, not as the driver. The model is the creator's default or the one the message names among the creator's providers; the skills, GitHub account, memory and cockpit are the creator's, and the creator's MCP servers are left out of a run a driver started, since they act with the creator's credentials; usage and cost fall on the creator. The driver's own variables, providers and tokens are never read.
- The creator's personal variables are not given to a run a driver started, only the workspace's and the project's. An identity token's `user_id` and `email` stay the creator's, and it gains `driver_id`, the person who sent the message.
- A driver's message is recorded as `[from <name>] <text>` (`driverPrompt`, `parseDriverPrompt` in `@aven/protocol/drivers`), so the agent knows who is speaking and the transcript shows it, with no change to the wire. A message the creator sends stays plain and is marked as theirs the way a person's is among bots' (`personPrompt`).
- The agent's `request_secret` question, whose answer becomes the creator's variable, is answered by the creator only.
- Multiplayer ends on its own when it expires, when its creator leaves the workspace, and when the thread is archived.

## Consequences

- The creator keeps the credentials and the bill and chooses how long to trust the team, as with a shell lent for a week. This guards against accident, not against a determined member: a driver can ask the agent to run anything in the sandbox as the creator.
- A driver acts through the creator's computer, so what the creator signed in to in its browser (decision 0180) is reachable by what a driver asks the agent to do, the same as the credentials above.
- A per-server setting that allows an MCP server in multiplayer (Amp's "Use in Multiplayer Threads"), shipping by a driver and per-driver GitHub identity, a workspace switch that forbids multiplayer, presence, `@` invitations and an audit trail of who drove are later work.
