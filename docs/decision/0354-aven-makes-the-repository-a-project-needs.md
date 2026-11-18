# 0353: Aven makes the repository a project needs

Date: 2026-11-18

Status: accepted. Supersedes the "There is no New project" clause of 0013, and extends 0299 (a repository is a project any computer can run) and 0252 (Add project's Folder and Clone tabs ask a computer).

## Context

A project is a folder on a runner or a GitHub repository (0218, 0299). On a workspace whose only computer is Aven Cloud, no runner serves folders, so the Folder and Clone tabs of **Add project** have nothing to offer: `use-add-project.ts` keeps only the runtimes with `directories`, and a cloud template has none. The GitHub tab lists only what an installation of the app already reaches (`GET /github/installations/:id/repositories`, `POST /projects/github`), and nothing in Aven could make a repository: `packages/github` had no `POST /orgs/{org}/repos` or `POST /user/repos`, and the app manifest asked for no Administration permission.

So a person with no repository had to leave Aven, make one on GitHub, add it to the installation and come back. The composer's project menu ended at "Install the Aven app on GitHub", which sends them to GitHub as well. Aven Cloud cannot offer a folder either: a sandbox is one thread's and is deleted after 48 hours (0299), so a project there has to be a repository.

## Decision

- **The GitHub tab has two modes, Existing and New repository.** New takes a name (GitHub's characters, at most 100) and whether the repository is private, which it is by default. Aven makes it in the account the installation belongs to and adds it as a project in the same step: the button says "Create and add".
- **`POST /projects/github/new`** takes `{ installationId, name, private }`. The project's name is the repository's. `projectsService.addNewGithubRepository` asks `githubService.createRepository` to make the repository and then inserts the row exactly as `POST /projects/github` does (`insertGithubProject`), so a repository is still one project per workspace.
- **The app asks for `administration: write`** (`app-manifest.ts`). For an organization the repository is made with a short-lived installation token that may administer it, with `administration` and `contents` write and `metadata` read; for a person's account it is made with that person's own user token (`POST /user/repos`), so they must have connected GitHub. `installationToken`, which caches a read-only token, is unchanged: the write token is never cached.
- **Every repository Aven makes starts with a commit** (`auto_init: true`), so it has a default branch. An empty repository has nothing for the first thread to check out and nothing for Ship to push from.
- **An installation that reaches only chosen repositories gets the new one added** (`PUT /user/installations/:id/repositories/:id`, with the person's token). Whether the app may make repositories at all is read first (`GET /app/installations/:id`, `permissions.administration`); when it may not, the answer is a 409 that says to approve the app's new permissions on GitHub, and `GET /github/installations/:id` gives the dialog the account's type, whether it may create and the installation's settings URL, so the button can say so before the person submits.
- **A project is only made once the app can reach the repository.** After making it, and adding it to the installation when it only reaches chosen repositories, the control plane reads it back with the read-only installation token (`canReach`). A repository it made but cannot reach is reported, the person adds it to the app and adds the project again, and no row ever points at a repository that cannot be cloned.
- **The composer's project menu offers "New repository"** beside the repositories it lists, which opens the same dialog and selects what it makes, so the new-thread page is not a dead end on Aven Cloud.

## Consequences

- Every installation of an app made before this has to approve the new permission once, on GitHub. Until it does, "New repository" says so and creation is refused; everything else about the app keeps working.
- A repository made in a person's account needs that person connected to GitHub; without it the answer says to connect (the existing connect link is in the same dialog).
- The name is GitHub's: a taken name or an account that does not allow the app to create is refused by GitHub and reported as one message, since the two cannot be told apart from its answer.
- Aven still hosts no git: the durable home of an Aven Cloud project is a GitHub repository (0299). A person with no GitHub account still cannot have a cloud project; a repository Aven hosts was considered and left out, because it needs push, pull requests, storage and backup of its own.

## Not verified

Making a repository in a personal account with the person's user token, an organization that restricts who may create repositories, and the approval flow on an installation that already exists. The client and the service are tested against a fake GitHub only.
