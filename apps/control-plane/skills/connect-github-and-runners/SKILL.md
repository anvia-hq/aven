---
name: connect-github-and-runners
description: Connect GitHub to Aven, import a repository, add or fix a runner (the machine that runs agents), and use aven doctor and aven update. Use when the user cannot import a repository, Connect GitHub or Ship is off or failing, an agent never starts, a runner shows offline, or Aven needs updating.
---

# GitHub and runners

## The pieces

- **GitHub App**: Aven reads repositories through a GitHub App installation, and asks each person to connect their own GitHub account so that `git` and `gh` in their sandbox act as them. The platform's owner creates the app once, in **Settings > Platform**, with GitHub's manifest flow.
- **Project**: a repository imported from the Projects page. Every thread belongs to one and starts from a clone of it, on a branch `aven/<thread id prefix>`.
- **Runner** (Settings > Runtimes): a machine with Docker and git that connects out to Aven and hosts a sandbox for each thread and each bot. A server installed with `aven install` has one on its own machine.

## Importing a repository

The Import dialog on the Projects page says what is missing:

1. **GitHub is not set up**: the platform's owner opens Settings > Platform and creates the GitHub App there.
2. **Connect a GitHub account** (the **Connect GitHub** button in the dialog): this installs the app on the account or organization that owns the repositories, so Aven can read them. Whoever presses it needs to be allowed to install apps there.
3. **A project needs a runner**: add one first (see below).
4. Then pick the repository and the runner it runs on.

A person who will ship pull requests also connects **their own** GitHub account, from the Ship button (**Connect GitHub to ship**), so that commits and `gh` in their sandbox are theirs. The app needs write access to **contents** and **pull requests** for that: GitHub asks the app's owner to approve it when it changes.

## Why Ship is off or refused

- Off with a tooltip: the repository has no `.aven/setup` or `.aven/ship.md` yet. Read `setup-env`, then `setup-ship`.
- "Connect GitHub to ship": the person's account is not connected.
- Refused with a 409: the app has not been approved for write access, or the person cannot push to the repository. Check their access on GitHub.

## Runners

- Add one in **Settings > Runtimes**: it gives a **token once**. On the machine: `aven runner install --url <address of Aven> --token <token>`. It checks Docker and git, pulls the sandbox image and installs a service that keeps it connected.
- `aven doctor` checks Docker, git, the server and the runner, and warns about plain HTTP open to a network and open sign-ups. Run it first when something does not start.
- **A runner that shows offline**: is the machine awake, is the service running (`aven doctor`), can it reach Aven's address, was the token revoked or rotated (then add a new runner).
- **"Unsupported runtime version"**: the runner and the server speak different versions. Run `aven update` on the runner's machine.
- `aven update` downloads the latest release, then updates the server (compose file, missing settings, images) and the runner (the sandbox image, a restart) on that machine. Say what it will do and let the person run it: it restarts things.

You run inside a sandbox: you cannot run `aven` for the person on their machine. Tell them the exact command and what to look for in its output.
