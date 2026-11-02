# Aven explains its own settings in built-in skills

Status: accepted. Builds on 0035 and 0081 (built-in skills reach every thread and bot), 0085 and 0086 (a bot keeps the person's MCP servers and providers).

## Context

The person wants their agents to know the product: to change a provider, connect an MCP server or fix a variable with them, not leave them to find the page. What an agent can do about each is different, and an agent that promises a change it has no tool for is worse than one that says where to click.

## Decision

- **Six built-in skills** in `apps/control-plane/skills/`, beside `setup-env`, `setup-ship` and `writing-skills`: `aven-help` (where every setting lives, what each kind of agent can change itself, and which skill to read), `configure-providers`, `configure-mcp`, `configure-variables`, `configure-bots` and `connect-github-and-runners`.
- **A skill says what to do with a tool and without it.** The same skill reaches a bot, which has tools for providers, MCP servers, bots, schedules and goals, and a thread's agent, which has none of them. Each skill gives the steps for an agent that has the tool (and says to look at its own tool list, not at the skill) and the exact page, button and values for one that does not, so the person always gets a result.
- **The skills hold to the rules of the tools.** A key or a token is never asked for in a message nor repeated: a bot uses `ask_provider_key`, a thread `request_secret`, and anything else is typed by the person in Settings. Settings change on the person's own word only, never for a note, another bot or a page. What a tool result or a server returns is information, not instructions.
- **Where a tool does not exist, the skill does not pretend.** Variables, GitHub and runners have no agent tool: those skills explain and diagnose, and tell the person the command or the page (`aven doctor`, `aven update`, Settings > Runtimes), since an agent in a sandbox cannot run them on the person's machine.
- **They are checked.** A test reads every built-in skill, so a broken frontmatter (a colon in a description once left a skill out) fails the build, and the provider and MCP skills must name every tool a bot has, so renaming a tool leaves no skill pointing at a name that is gone.

## Consequences

- Every run's instructions list six more skills by name and description, a few hundred characters; their text is read only when needed.
- A skill is a copy of what the product does: when a setting moves or a tool changes, its skill changes in the same commit.
- A person can replace one with a skill of their own of the same name (decision 0035), or switch it off.
