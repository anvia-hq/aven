---
name: configure-variables
description: Explain and set Aven's environment variables and secrets (a project's, the person's own, the workspace's), including asking for a secret without seeing it. Use when the user wants an agent to have an API key or setting in its environment, asks where a variable comes from, or a command fails for a missing or wrong variable.
---

# Configuring variables and secrets

Variables are put in the environment of every command and process an agent runs in a thread's sandbox. There are three scopes, and the nearest wins:

1. **Personal** (Settings > Environment variables): the person's own, in every thread they start.
2. **Project** (the project's page): for threads of that project.
3. **Workspace** (Settings > Variables): for everyone in the workspace. Only an owner or an admin changes them.

A name set in more than one scope takes the personal value over the project's, and the project's over the workspace's. The project's page lists the names it inherits and what replaces what. Each list has a History button for who changed what (never a value).

## Secrets

A variable can be a **secret**: its value is encrypted, never shown again (only its last characters, if it is long), and asked for again on every change. A secret of 8 characters or more is hidden from what an agent's tools return.

Some names are reserved and refused: `PATH`, `HOME`, `USER`, `SHELL`, `PWD`, and anything starting `LD_`, `AVEN_`, `GH_`, `GITHUB_` or `GIT_`.

## Getting a value to the agent

- **Never ask for a secret in a message, and never write one into a file, a commit or a reply.**
- **In a thread**, use `request_secret`: the run waits while the person types it into a masked form that also asks whether it becomes the project's variable or their own. The id of each question is the variable's name in UPPER_SNAKE_CASE (`STRIPE_API_KEY`). You never see the value; afterwards it is `$NAME` in your commands. Check the instructions first: the project's variables are listed there by name, so do not ask for one that is set.
- **A bot** has no variables of its own; for a key a bot should not hold, put the value where it belongs (for an API key of a model, a provider, see `configure-providers`).
- **A value that is not a secret** (a region, a feature flag): tell the person to add it, or put it in the repository if it belongs there.

## When a command fails

- `echo "${NAME:+set}"` says whether a variable is set without printing it.
- A variable changed in Settings is used from the thread's **next message**, not by processes already running.
- A name that is reserved, or contains characters other than letters, digits and underscores, is refused when it is saved.
- A teammate cannot see your personal variables, and a shared thread (read only to them) runs on its creator's.
