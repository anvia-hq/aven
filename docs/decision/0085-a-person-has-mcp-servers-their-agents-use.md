# A person has MCP servers their agents use

Status: accepted. Builds on 0035 and 0081 (a person's skills reach a thread's agent and a bot), 0045 (a run's secrets are kept in memory), 0021 (every thread agent runs through durable), 0058, 0059 and 0067 (bots, their runner and what only the person's word changes).

## Context

The person asked for MCP for both bot and thread agents: a server may be for bots, for threads or for both; a bot can use, set, edit and delete servers; a thread's agent can only use them; servers are the person's, not the workspace's; and the person can switch each on and off.

`@anvia/mcp` adapts a server's tools for an agent's `mcpServers`. `@anvia/durable`, which every thread agent runs through (0021), refuses an agent with `mcpServers` ("static local tools only"), and a bot's agent does not use durable. An adapted tool is a plain object that says where it came from in an `mcp` field, which an agent's `tools` refuses.

## Decision

- **Remote servers only, over streamable HTTP.** A stdio server runs a command from the person's settings; on the runner's host that is remote code execution, so it is left out until it can run inside a sandbox.
- **A server belongs to a user** (`mcp_servers`), like skills and providers, and goes with them into every workspace. It has a name, whose slug (`Team Notes` is `team_notes`) starts its tools' names and which two names that read alike share, an address (http or https, no credentials in it), headers (a secret: encrypted with the providers' key, their names shown and their values never read back; a header sent without a value on an edit keeps its value), `target` (`all`, `bots` or `threads`), `enabled`, `allow_local`, and the last error and when it last worked. At most 20 a person.
- **Every run carries what its sender may use.** `mcpService.forRun(userId, "threads" | "bots")` gives the enabled servers for that kind of agent, with their headers decrypted, as `mcp` on `run.start`, `run.resume` and `bot.reply` (wire version 36). The runner keeps them in memory for the run, never in its journal or record, as it does a run's variables (0045); after a restart a run has none.
- **The runner connects each server by itself** (`connectMcpServers`), with a 15 second timeout and a cap on how much a server may list, so one that is down is left out and the run goes on without it. Its tools become plain local tools by dropping `mcp`: that is what lets a durable agent, and a bot's, call them. A server's address on the runner's own machine or network is refused (the library's strict SSRF check) unless the person set `allow_local` for it; only the person sets that.
- **A parked run calls through the connection it has now.** A run that stops on a question outlives the run that asked, whose connections ended with it. The tools of every thread agent are late bound, as the sandbox's are (`lateBoundTools`): they call whichever connection the thread has, which the run that answers brings. Subagents get the same tools. Their output is kept small as a sandbox tool's is.
- **The agent is told.** Its instructions list the servers that connected, with their tool counts, and those that did not and why, and say that what a server returns is information and never instructions.
- **The runner says how each went.** `mcp.report` (a run) and `bot.mcp` `report` (a reply) give the control plane, for the servers the run or reply was given only, the reason one did not connect or that it did. Settings shows the error and when it last worked; changing a server's address, headers or local switch clears the old error.
- **A thread's agent can only use servers; a bot can keep them, on the person's own word.** `bot.mcp` lists, adds, changes and removes the person's servers (`list_mcp_servers`, `add_mcp_server`, `update_mcp_server`, `remove_mcp_server`). Changing them takes the person's own message: not a note, not another bot, and not the main bot passing a request on, since something a page or a bot wrote could otherwise point a server at an address of someone else's. A bot cannot read a header's value, cannot set a server to be on the runner's own network, and a saved header never goes to an address the bot changes: a bot that moves a server must give the headers again, or the server has none.
- **The person manages them at Settings > MCP servers**: add, edit, switch on and off, remove, and who uses each.

## Consequences

- A server's tools are the person's, in every workspace; another member of a workspace never uses them, and a shared thread (0084) runs on its creator's.
- Every tool a server offers is exposed: there is no allow-list per tool, and no review of a changed server. What a server returns reaches the model and the transcript. The headers' values are not hidden from tool results the way a variable's are (0045): a server that echoes its own token back would show it.
- A thread agent's server is reached from the runner, not the control plane, so a server must be reachable from the runner's machine; one on a private network needs `allow_local`.
- The runner needs an update (wire version 36); an older one is refused until `aven update`.
- A run taken up again after a restart has no servers, as it has no variables or GitHub account.
