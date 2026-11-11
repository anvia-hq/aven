# The GitHub app can change workflows and run actions

Status: accepted. Changes the permissions named in 0044 and 0074; the rest of both stands.

## Context

A thread asked to split `.github/workflows/ci-cd.yml` in two committed the change, and GitHub refused the push: `refusing to allow a GitHub App to create or update workflow .github/workflows/cd.yml without 'workflows' permission`. GitHub asks for the Workflows permission for any push that creates or changes a file under `.github/workflows/`, and the app asked for none. The app also had Actions read only, so the agent could read a run but not start, re-run or cancel one (`gh workflow run`, `gh run rerun`).

## Decision

- **The manifest asks for Workflows read and write, and for Actions read and write** (it asked for Actions read). The rest is as before: Contents and Pull requests write, Issues, Checks and Commit statuses read, Metadata read, no webhook.
- **Nothing else is added.** Repository administration, secrets, variables, environments, deployments, packages and organization permissions stay out, so the agent still cannot change a repository's settings or read its secrets. Issues stays read: opening or commenting on issues is a separate choice.

## Consequences

- **A run can change CI, and CI runs with the repository's secrets.** A prompt injected into something the agent reads can now steer it to push a workflow that prints or sends a secret, which the narrower app could not do (0044's guard is still the person watching the thread, but this is a larger reach than a branch of code). A repository that does not want that can protect its default branch and require review of `.github/workflows/`, which applies to the agent as it does to the person.
- **Only apps made after this have the permissions.** GitHub does not change an existing app's permissions: its owner sets Workflows and Actions to read and write in the app's settings (Permissions & events), and then an owner of each installation approves the request (GitHub emails them), and until then pushes of workflow files and starting runs are still refused. Nothing in Aven shows a missing permission for these yet; the agent reports GitHub's refusal.
- A person's token is limited to what both the app and the person may do, so someone without write access to a repository still cannot start its workflows.
