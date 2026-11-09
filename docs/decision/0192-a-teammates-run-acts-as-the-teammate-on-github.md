# A teammate's run acts as the teammate on GitHub

Status: accepted. Narrows 0179, which ran a driver's message wholly as the creator, and builds on 0044 (a run acts as its sender on GitHub).

## Context

0179 lent the creator's model, memory, MCP servers and GitHub account to every teammate who drove a thread, so a teammate's commits and pull requests were authored as the creator. 0179 listed per-driver GitHub identity as later work.

A run signs `gh` and `git` in once, when it starts (0044). One run therefore has one GitHub identity, and a message that steers a running agent cannot change it.

## Decision

- A run a teammate starts, or resumes by answering the agent's question, gets the teammate's GitHub token, name and noreply email, not the creator's.
- A teammate who has not connected GitHub gets a run with none. It never falls back to the creator's GitHub.
- A message that steers a run that is going keeps the identity the run started with.
- The model, key, bill, memory, skills and personal variables stay the creator's, and MCP servers stay off for a teammate's run. The identity token's `user_id` and `email` stay the creator's, with `driver_id` the teammate.
- The composer's note in a multiplayer thread says what is the teammate's and what is the creator's.
- The wire is unchanged: `github` on `run.start` already carries a token and a name.

## Consequences

- A teammate's token is in a container that holds the creator's workspace, so the agent, and anything it runs there, can use it. Connecting GitHub is the teammate's consent.
- A teammate without GitHub sees `gh` signed out. The agent's instructions say what to ask.
- A per-server MCP switch for multiplayer and an audit trail of who drove remain later work.
