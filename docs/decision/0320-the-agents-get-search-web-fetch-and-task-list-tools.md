# 0320: The agents get grep, find, glob, web_fetch and todo_write

Date: 2026-11-16

Status: accepted. Follows the comparison of Aven's system prompt with oh-my-pi's.

## Context

A thread agent and a bot with a computer searched files by running `grep`, `find` and `ls` through `exec_command`, read web pages with `curl`, and kept no visible task list. Output was unbounded, `.git` and `node_modules` flooded results, and a bot had no web search at all.

## Decision

- `grep`, `find` and `glob` run `grep` and `find` on the computer with an argument list, never a shell string, and skip `.git` and `node_modules`. They cap the lines returned and say how many were left out. `glob` matches a path pattern, `find` matches a name.
- `web_fetch` runs on the runner. It reads public http and https pages as text, pages long ones with `offset`, and refuses private, loopback and link-local addresses, also after each redirect.
- `todo_write` takes the whole list each time and keeps nothing: the list lives in the conversation, so a restart loses nothing.
- All five are added to the tools every computer gets (`sandboxTools`), so thread agents and bots with a computer have them. `grep`, `find`, `glob` and `web_fetch` also go to explorer subagents; `todo_write` stays with the parent.
- `bot.reply` carries the web search key as a run does, so a bot has `web_search` too.

## Consequences

- `web_fetch` resolves the name, checks it, and then lets `fetch` resolve it again, so a name that changes its answer between the two could still reach a private address. Pinning the connection to the checked address would close it.
- The Claude and Codex backends keep their own search, fetch and task tools.
