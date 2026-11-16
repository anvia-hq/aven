# 0319: A new thread picks its computer before its project

Date: 2026-11-16

Status: accepted. Follows 0218 and 0299, which made a project either a folder on one computer or a repository any computer can run.

## Context

The new-thread page listed projects first and the computer second, and the project had to exist before the composer appeared. Adding one went through a dialog with three tabs. The choice that matters first is the computer, and the project means a different thing on each kind: a folder on a machine, a repository in a sandbox.

## Decision

- The computer is picked first. It defaults to Aven Cloud when one is offered, otherwise an online computer.
- On a machine the project menu browses the folders that computer serves and adds the one chosen, which is a path.
- On a sandbox it lists the GitHub repositories the workspace's app can reach and adds the one chosen, which is a repository project with no folder.
- A folder or repository that is already a project is selected, not added again.
- The five projects a thread touched last are listed under Recent, filtered to the kind the computer can run.

## Consequences

- The new-thread page no longer waits for a project before showing the composer, and it no longer uses the Add project dialog. That dialog stays on the projects page.
- A thread still needs a project before it starts. Sending without one is refused and the prompt is kept.
