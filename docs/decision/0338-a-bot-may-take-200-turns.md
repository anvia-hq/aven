# A bot may take 200 turns

Status: accepted. Supersedes the bot limits that [0076](0076-long-runs-turn-limits-and-goals.md) left alone (0058, 0059).

## Context

A bot's reply was limited to 8 model calls, or 30 when it had a computer (`BOT_MAX_TURNS`, `BOT_COMPUTER_MAX_TURNS`). The coding agent and its subagents already take 200 (0076). A bot that has to look something up, work on its computer, or follow a long request hit the limit and stopped with an error in the middle of the work.

## Decision

- **A bot takes 200 turns for each reply**, with or without a computer. There is one limit, `BOT_MAX_TURNS`; the separate one for a bot with a computer is gone.
- A goal's session is still one run, so a goal's total is its sessions times 200, as for a thread (0076).

## Consequences

- A bot that loops can spend up to 200 model calls on one message, where it spent 8 or 30. Nothing here limits cost other than the turns, as in 0076.
- A bot is not told its budget: only the coding agent's instructions are (`longTasks`), and the bot's are unchanged.
