# A bot chooses the runner of its computer

Status: accepted. Replaces the part of 0059 that says a per-bot choice of runner is not built, and moves the folder 0059 and 0219 give a bot.

## Context

A bot's computer was one deployment-wide runner: the control plane's own, or the one `AVEN_BOT_RUNNER` names. Every bot of every person worked on the same machine, which on a server is the server itself. A person wants a bot's files and commands on a machine of their own (a Mac mini, a home server), apart from the control plane, and each bot on its own.

## Decision

- **A bot has a `runtime_id`** (`bots.runtime_id`, null by default, set null when the runner is revoked), changed in the bot's settings under **Computer**. Null keeps what there was: the built-in runner, or `AVEN_BOT_RUNNER`.
- **Who may choose which**: the built-in runner, a host runner the person owns, or a shared runner of a workspace they belong to (`requireUsableRuntime`). Another person's host runner, another workspace's runner and a revoked one are refused.
- **The choice is checked again at each reply**, so a bot whose person has left the runner's workspace, or lost its host runner, stops until they choose another, and the reply says why.
- **Replies and the computer follow the bot.** `RemoteBotReplier` takes the runner from the bot, falling back to the deployment's. The agent still runs on the control plane's built-in runner and names the bot's runner as its machine (0222). `GET /bots/:id/computer`, `.../computer/wake` and a bot's artifacts reach the same runner.
- **The folder** is `<runner home>/bots/<id>` (on a normal host `~/.aven/runtime/bots/<id>`), no longer `workspaces/<id>`. A runner recognises a bot's folder by its existing: `bots/<id>` if there is one, else `workspaces/<id>`. A bot's first use after the update moves an old `workspaces/<id>` to `bots/<id>`, with its files. `ThreadRef.bot` tells the runner the id is a bot's, and flows through `prepare`.
- **Moving a bot to another runner does not move its files.** The new runner starts with an empty folder, and the old one keeps what was there.

## Not done

- The computer does not follow a bot's files to a new runner.
- `computer_status` and `computer_wake` still exist, though a folder on a runner is always awake.
