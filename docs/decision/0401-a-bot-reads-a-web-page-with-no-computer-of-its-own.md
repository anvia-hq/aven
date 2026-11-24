# A bot reads a web page with no computer of its own

Status: accepted. Supersedes part of 0358.

## Context

0358 sorted a reply's tools by whether they need the machine, and put `web_fetch` on the machine's side: "Without a computer a bot has no `exec_command`, no files, no `web_fetch`, no skills...". That was wrong about `web_fetch` and right about the rest. It is plain HTTP from the process the agent runs in, with no folder, no shell and no port of the machine under it, and a bot without a computer runs in the control plane, which reaches the internet as well as a runner does. Its instructions said so too: `<no-computer>` listed "open a web page" among what the bot cannot do, and its one-line summary ended "and no page to open".

What that cost: a person could paste a URL to a bot with no computer and the bot said it could not read it, in one sentence, while the same bot already had `web_search` whenever the deployment had a Tavily key. A thread's agent has had `web_fetch` all along (`packages/runtime-client/src/tools/thread-tools.ts`), and so has a bot with a computer, whose page reader arrives with the rest of its computer's tools.

## Decision

- **A bot has `web_fetch`, with or without a computer.** `botAgentParts` (`packages/agents/src/bot-agent.ts`) adds it when the reply brings no computer tools of its own, which is how `bot-instruction.ts` already tells the two apart; a bot with a computer keeps taking it from the computer's tools, so it is never offered twice.
- **The tool is the thread agent's, unchanged.** `createWebFetchTool` (`packages/agents/src/tools/web-fetch.ts`): public http and https addresses only, DNS checked before the request and the connection pinned to the address it checked, HTML turned into text with its links, paging with `offset` and `maxChars`, 2 MiB read and 100,000 characters a page, 20 seconds.
- **The instructions stop saying it cannot.** `<no-computer>` names reading a public web page among what the bot does, and no longer counts it among what it cannot; the one-line summary is "no folder of your own and no shell".
- **A bot on a Claude or Codex subscription gets it too**, since a hosted reply's tools are its catalog (`packages/runtime-client/src/bot-replies.ts`).

## Consequences

- A person can hand a bot a link in any workspace, and the bot reads it, with no computer, no runner and no extra key.
- Skills, goals, MCP servers' tools, commands, files and sending a file still wait for a computer: 0358 holds for all of them.
- The tool is offered to a bot the person may not trust with the internet; that is the same reach `web_search` already gave it, and the same reach a thread's agent has.
