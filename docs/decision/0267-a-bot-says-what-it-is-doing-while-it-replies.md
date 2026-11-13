# 0267. A bot says what it is doing while it replies

Status: accepted. Adds to 0059 and to the Bots chat of 0058. Changes the runtime wire (version 58).

While a bot worked, the chat showed "Pip is typing…" for the whole reply, however long it spent reading files, running commands or asking another bot, so a person could not tell a bot at work from one that was stuck.

- The bot's agent reports what it is doing through its lifecycle: `Thinking` when a reply starts and after each tool, a short label while a tool runs, and nothing when it is done. The runner sends it to the control plane as `bot.activity { replyId, label }`, once for each change.
- The label is made from the tool's name, with no model call and without the arguments: `Reading app.ts` (the file's name, not its folder), `Running a command`, `Searching the web`, `Starting a thread`; an MCP tool or any other the list does not know becomes `Using <its name in words>`. A command line, a path or a prompt can hold a secret, so none of them is shown.
- The control plane relays it to the person's open chat as an `activity` event and keeps the latest label in the channel, so a chat opened mid-reply starts with it (`activity` on the snapshot). It is cleared when the bot stops typing.
- The Bots chat shows the label beside the bot's avatar in place of "is typing…", and falls back to that text before the agent has started.
- Only bots do this. A thread's agent shows its tools in the thread already (0071) and is left as it is.
- A runner that has not updated does not send the label, and the control plane refuses it by wire version until `aven update` has run (see `docs/products/0005-runtime-wire-versions.md`).
