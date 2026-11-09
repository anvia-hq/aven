---
name: review-code
description: Review your own finished change for edge cases, scenarios and security before you call it done or open a pull request. Use after finishing any code change in this repository, and when asked to review a diff, a branch or a pull request.
---

# Reviewing finished code

A passing test run says the cases you thought of work. This review looks for the ones you did not. Do it when the work is finished and before you report it, on the real diff (`git diff main...HEAD`, or `git diff` for uncommitted work), reading every changed file and not only the parts you remember.

## 1. Know what changed

State in two lines what the change is for and what it must never do. Then list what it touches: tables and migrations, the wire (`packages/protocol`, `WIRE_VERSION`), endpoints, what a runner does, what the person sees.

## 2. Edge cases

For each new or changed function, ask what happens with:

- nothing, one, and very many (empty list, empty string, null, a limit exactly at its bound, one past it);
- the same call twice, two calls at once, and calls in the wrong order (retries, a double click, two tabs, two runs on one thread);
- a failure half way: the database write that succeeded before the call that threw, a run that ends while the message is sent, a runner that restarts mid-run (its journal and outbox in `runs.db`);
- time: expiry in the past, clocks, time zones, a value that changes while you read it;
- text: unicode, very long lines, quotes, newlines, the characters your format treats specially;
- what is gone: a deleted project, an archived thread, a removed member, a revoked runner, an offline runner.

## 3. Scenarios

Walk the change through the people and machines that use it, not only the one you built it for:

- the creator, a teammate who can read, one who can drive (multiplayer), a member of another workspace, a person with no account;
- an old runner or client against the new server, and the reverse (wire versions, optional fields);
- an install that is updated in place (`aven update`), with data and a `.env` from before the change;
- a thread that already has history, not a new one.

Write down each scenario you walked and what you saw. A scenario you could not run, say so.

## 4. Security

Check each, and name the file and line where it is true:

- **Who may do it.** Every route says its access (`read`, `drive`, `own`) and every query is scoped to the organization and the person. A thread or project id from another workspace is a 404, never data. New routes need a test for another workspace.
- **Whose credentials run.** A run acts as one person; code that reads a variable, token or account must not widen to someone else's.
- **Secrets.** Tokens, variable values and keys never go in logs, errors, the transcript, the run journal, a file or a response. Compare with how `secret-redaction.ts` and the credential handling treat them.
- **Untrusted input.** Anything a person, the agent, a repository, an MCP server or a model returns is data: no shell, SQL or path built from it by string joining, paths confined by real path, URLs checked (no loopback or internal addresses unless allowed), sizes limited.
- **Output.** Text drawn in the platform goes through the markdown component, never raw HTML.
- **Trust edges.** What the agent can ask the control plane for, and what a runner may tell it, are checked on the receiving side.

## 5. Report

Fix what you find. Then give the person a short list in this order: what you fixed, what you decided to leave and why, what you could not check. Do not claim a case works that you did not run: run it, or say it is untested.

Also run `comments-audit` and `no-implicit-state` on the diff.
