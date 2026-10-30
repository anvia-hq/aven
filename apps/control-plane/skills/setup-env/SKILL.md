---
name: setup-env
description: Set up this repository's environment so every new thread starts ready to work, then save it as a snapshot. Use when the user asks to set up the environment, when a thread keeps reinstalling dependencies or tools, or when the project needs system packages or a toolchain the sandbox does not have.
---

# Setting up the environment

Every new thread starts from a bare sandbox and a fresh clone. This skill writes the repository's setup script, `.aven/setup`, and has the runner run it once and keep the result as a **snapshot**. New threads on this repository then start from the snapshot (the dependencies already installed, the tools already there) and only bring the repository up to date. The snapshot is used for 72 hours and then made again from the script.

You cannot install system packages in your own sandbox (`sudo` does not work there), so you cannot test the whole script yourself. `save_environment` is the test: it runs the script in a fresh setup container where `sudo` and `apt-get` work.

## 1. Find out what the project needs

Read, in this order, and stop when you know enough:

- the README, `CONTRIBUTING`, `AGENTS.md`, `CLAUDE.md`: they often name the setup commands;
- the package manager and its lockfile: `bun.lock`, `pnpm-lock.yaml`, `package-lock.json`, `yarn.lock`, `uv.lock`, `poetry.lock`, `requirements.txt`, `Cargo.lock`, `go.sum`, `Gemfile.lock`;
- the runtime versions: `.tool-versions`, `.nvmrc`, `.node-version`, `.python-version`, `rust-toolchain.toml`, `go.mod`, `engines` in `package.json`;
- the CI workflows in `.github/workflows`: what CI installs is what the project needs;
- a `Dockerfile` or `docker-compose.yml`: system packages and services it names;
- what is already in the sandbox: run `node -v`, `bun -v`, `python3 --version`, `go version`, `cargo --version`. Install only what is missing or the wrong version.

Do not guess. If something that matters is unclear (a private registry, a license key, a database the tests need), ask the user.

## 2. Write `.aven/setup`

An executable shell script at `.aven/setup`, run from the repository root as the user `node` (with `sudo`) with no interaction. Write it like this:

```bash
#!/usr/bin/env bash
set -euo pipefail

# System packages the project needs.
sudo apt-get update
sudo apt-get install -y --no-install-recommends libvips-dev

# Dependencies, from the lockfile.
bun install --frozen-lockfile
```

Rules:

- **Idempotent.** It may run again on a repository that is already set up.
- **From the lockfile**, with the frozen or locked flag, so the result is the same every time.
- **No long-running processes.** Dev servers, watchers and databases are stopped when the script ends. Build things; do not start them.
- **No secrets and no `.env` files.** The script is committed to the repository.
- **No interaction.** `-y`, `--yes`, `CI=true` (already set); nothing that waits for input.
- **Quiet about what matters.** Print one line for each step so a failure is easy to find in the log.
- Keep it short. Install what a thread needs to start working, not everything the project could ever use.

Then make it executable: `chmod +x .aven/setup`.

## 3. Optional: `.aven/resume`

If a thread needs something quick each time its container starts (a login, a cache refresh, a service started in the background), put it in an executable `.aven/resume`. It runs at every container start and the agent waits for it for at most 10 seconds. Do not put installs in it. Most repositories do not need one.

## 4. Save it

Call `save_environment`. It can take many minutes. If it fails, the error holds the end of the script's output: read it, fix `.aven/setup`, and call it again. Common causes are a package name that is wrong for Debian, a missing `sudo`, a tool that needs a newer version than the apt one, and a command that asks a question.

## 5. Tell the user

When it is saved, say in a few lines:

- what the script installs;
- that new threads on this repository now start from the snapshot;
- that **the `.aven` folder must be committed** (the user ships it with their Ship button, or you can commit it if they ask), because the snapshot is made again from the repository's script after 72 hours and when it changes;
- that the next step is `/setup-ship`, which sets up how this repository's changes are shipped.

Do not commit or push anything yourself unless the user asks.
