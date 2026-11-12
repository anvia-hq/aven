# 0252: A repository is cloned onto the runner and added as a project

Status: accepted. Refines 0218 (a runner serves folders and a project is one of them); the GitHub import that 0219 stopped offering stays retired.

## Context

Since 0219 a project is a folder on a runner. A person who wants a project from a GitHub repository has to clone it on the computer first, then add the folder. The old import dialog went with 0219 because it asked GitHub (through the GitHub app) for the repository and had the runner clone it with a token, which the folder model no longer uses.

## Decision

- **"Add project" has two tabs, Folder and Repository.** Both pick a computer. Folder browses its served folders as before; Repository takes `owner/name`, an https address or `git@host:owner/name`.
- **The runner clones the repository once** (`folders.clone`, an optional call: an older runner answers "unknown call" and the control plane says to update it) into `<runner home>/repos/<host>/<owner>/<name>`, with the machine's own git sign-in and no token from Aven (0218). Anything else than owner/name, an https address with no credentials or an ssh address is refused, so a path on the machine, `file:` or an option cannot be passed to `git clone`.
- **That folder is served by every runner** (`HostSandboxes` adds it to the folders it reports), and the control plane makes the project with the same rules as Add folder (`POST /projects/repository`, then `addFolder` on the path the runner returned). Adding it again fetches it and fails with "already a project" if it is one.
- **A thread still works in its own local clone on its own branch** (0218). When the folder is under `repos/`, the runner fetches it and fast-forwards it before it makes a thread's clone, so a new thread starts from what the remote has, not from the day the repository was added. A fetch that fails (offline) is ignored.
- **The GitHub import is removed**: `POST /projects`, `projectsService.import`, the installation's repository list (`GET /github/installations/:id/repos`) and the client calls behind them. A project already imported keeps working, with its branch, files, README and commits read from GitHub; no row is changed.
- **Ship is unchanged** (0231): the agent finds the GitHub remote in the base folder and pushes from there.
- A `git worktree` is not used, for the reason in 0218: the runner's own git reads a thread's workspace as a standalone clone.

## Consequences

- No GitHub App is needed to add a repository; a private one works only if the computer is signed in to git.
- The base clone is Aven's: a person should not work in it, since the runner fast-forwards it.
- A repository added to two computers is cloned on each.
- The clone can take minutes: the control plane waits up to eleven for it.

## Not verified

A private repository over https on a machine with only a credential helper, a very large repository, and a repository whose default branch is not what the clone checks out.
