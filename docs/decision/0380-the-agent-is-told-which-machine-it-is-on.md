# The agent is told which machine it is on

Status: accepted. Follows 0218 (a runner is the person's computer) and 0299 and 0306 (Aven Cloud is a sandbox per thread, one provider each). Decided 2026-11-17.

## Context

The coding instructions told every agent the same thing: that it works on the person's own computer, in a clone of their folder. A run on Aven Cloud is neither. It is a fresh machine, `boat` or `spaces`, with a clone of the project's repository, and it is deleted when the thread is idle, so work that was not pushed is lost. The agent could not tell which it was. Nothing in the prompt said, and the run message did not carry the runtime's provider, so it guessed from the folder path and got it wrong.

## Decision

- `run.start` and `run.resume` name the runtime's provider on the thread (`manual`, `boat` or `spaces`), read from the runtime row when the run is placed. The field is optional, so a runner from before leaves it unread and `WIRE_VERSION` stays.
- The `<machine>` section says which it is. On a computer it is the person's own machine, and the folder and its tools stay. On a sandbox it names the provider, says the machine is thrown away when the thread is idle, and says the workspace is a fresh clone of the repository. A subagent is told the same.

## Consequences

- A run whose runtime has no provider row, or a runner that has not updated, is told it is on the person's computer, which is what it was told before.
- The line about a folder's own GitHub remote stays on a computer only. A sandbox is told to push its branch and open a pull request.
