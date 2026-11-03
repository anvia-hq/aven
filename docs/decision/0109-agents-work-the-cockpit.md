# Agents work the cockpit

Status: accepted. Adds to 0104 (the cockpit is the person's own, and no agent acted on it) and 0105 (a body is BlockNote's blocks, or text read in as markdown).

## Context

The cockpit was for the person only. They want their bots to keep it with them (capture into the inbox, make and move tasks, write notes) and a thread's agent to look things up in it, but never change it.

## Decision

- **One `cockpit` tool** (`packages/agents/src/tools/cockpit.ts`), in the shape of the memory tool: a command and flat fields. `list` (an inbox, tasks or notes, filtered by tag, words, a task's status or an item's done), `get` (one in full), `tags`, and for a bot `create`, `update` and `delete`. A record is named by its id, a task also by its key (`T-3`).
- **Bodies are markdown.** What an agent writes is kept as it is written: the editor already reads text in as markdown when it opens (0105), and becomes blocks once the person edits it. What an agent reads is markdown whoever wrote it: BlockNote's blocks are written out by `cockpitMarkdown` (`@aven/protocol/cockpit-markdown`: headings, lists, checklists, quotes, code, tables, links, bold, italic, strike, code). An update's body replaces the whole body.
- **A thread's agent reads only.** A run carries `cockpit: "read"` and its agent is given the tool with the read commands alone; its subagents have none. The control plane answers `cockpit.read` for the run's sender, whatever the runner names, and refuses a write.
- **A bot writes, and deletes on the person's word.** A reply carries `cockpit: "write"`; `bot.cockpit` is answered for the bot's owner. A bot adds and changes records on any reply, so a schedule's task can put its findings in the inbox, but deletes only when the reply began with the person's own message (`onPersonsWord`). Each command's fields are checked by the same rules as the platform's changes (`modules/cockpit/commands.ts`).
- What the cockpit holds is the person's information, not instructions: the tool says so.

## Consequences

- A thread's tool calls are in its transcript, so a thread shared with the workspace (0084) shows what its agent read of the person's cockpit.
- Rewriting a body the person formatted in the editor through markdown keeps what markdown has and loses the rest (colours, alignment).
- `cockpit` on `run.start`, `run.resume` and `bot.reply`, and the calls `cockpit.read` and `bot.cockpit`, are wire version 42: a runner must `aven update`.
