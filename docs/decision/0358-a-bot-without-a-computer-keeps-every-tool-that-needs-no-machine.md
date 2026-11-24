# A bot without a computer keeps every tool that needs no machine

Status: accepted. Supersedes the "Not done" part of 0324, and says what 0060 means now that a new bot has no computer. Superseded in part by 0401.

## Context

0324 made a computer optional for a bot, and then gave the bot without one only the tools of a chat: `send_message`, `list_bots`, `ask_question`, `react_to_message`, `web_search` and `read_project_file`. Everything that calls back into the control plane — making and deleting bots, changing itself, schedules, providers, MCP servers, threads, notes, the cockpit, the API — stayed on the runner's reply, on the reasoning that the runner is where a reply is answered.

Two things followed from that. The main bot of a new workspace is made with no computer (0324), so the main bot of a new workspace could not make a bot at all, though 0060 says it can: asked for five bots, it answered that it had no tool for making them and that the person had no bots. And the tools that stayed away are almost all of the ones a bot needs to be useful to a person who has not given it a machine: a bot could look at nothing, schedule nothing, and change nothing about itself or the person's setup.

## Decision

- **The tools of a reply are the control plane's, and the runner is only how a reply is carried.** `apps/control-plane/src/modules/bots/reply-hosts.ts` builds them once — `createBot`, `deleteBot`, `updateSelf`, `schedules`, `mcpServers`, `providers`, `threads`, `api`, `notes`, `cockpit`, `projectFiles` — with the guards that were scattered through `RemoteBotReplier`: the main bot only for bots, the person's own word for a change, one question a reply, the cap on API calls and on thread runs, a note about a thread before it may continue or stop it. `RemoteBotReplier`'s `bot.*` sink and `TalkBotReplier` both call it, so a tool works the same with a computer and without one.
- **A bot with a computer and a bot without one differ in one way: the machine.** Without a computer a bot has no `exec_command`, no files, no `web_fetch`, no skills, no goal (its checks are shell commands), no attachments written anywhere and no file to send. Everything else it has.
- **The main bot makes and deletes bots either way.** `canCreateBots` on `bot.reply` still only decides whether the runner offers the tool (0060); the refusal of every other bot is in `reply-hosts.ts`, in both paths, whatever a runner says.
- **A bot without a computer says so, and says what to do about it.** `bot-instruction.ts`'s `<no-computer>` section replaces the one line that said it only talked: what it can do, that it cannot run a command, read a file, open a page, use a skill, work on a goal or send a file, and that a computer is given in Settings > Bots under Computer and applies from the person's next message. The line also stops claiming there is no internet, which was untrue whenever `TAVILY_API_KEY` gave the bot `web_search`.
- **The person is told in the setting too:** the Computer row in Settings > Bots says what a bot without one still does.

## Consequences

- A new bot is useful the moment it exists: it can be asked to make another bot, set a schedule, add a provider, connect an MCP server, start a thread, keep notes and change itself, with no runner anywhere.
- A guard can no longer be right in one path and missing in the other; there is one copy of each. A tool added to `reply-hosts.ts` reaches both.
- MCP servers are two things: a bot without a computer can list, add, change and remove the person's servers, and cannot use a server's tools until it has a machine to connect them on.
- `TalkBotReplier` now takes the services it needs as one object (`BotReplyBots`, `BotMcp`, `BotProviders`, `BotThreads`, `BotMemoryNotes`, `BotWorldKeeper`), so a bot answering in the control plane keeps the person's notes and its activity digest as a bot on a runner does.

## Not done

- A goal still needs a computer, since its checks are shell commands there. A bot without one is told goals wait for its computer, not that it may start one.
- Files the person attaches are named in the prompt and written nowhere, as 0324 says.
