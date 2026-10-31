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
- **No secrets.** The script is committed to the repository, and the setup container gets none of the project's environment variables. What the project needs to run (an API key, a database URL) is set by the user as the project's **environment variables** on its page in Aven, and the agent's commands have them from then on: your instructions list their names. If a value is missing, ask the user to add it there; never write one into the script. A copy of a template with local, non-secret values is fine: `[ -f .env ] || cp .env.example .env`. Most loaders (Bun, Node's `--env-file`, dotenv) keep a variable that is already set over the same name in a `.env`, so a project variable usually wins.
- **No interaction.** `-y`, `--yes`, `CI=true` (already set); nothing that waits for input.
- **Quiet about what matters.** Print one line for each step so a failure is easy to find in the log.
- **pnpm: keep its store out of the repository.** With the workspace mounted from the host, pnpm cannot share a disk between its store and the project, so it leaves a `.pnpm-store` folder (hundreds of megabytes) in the repository's root. Put the store in the home folder first: `pnpm config set store-dir "$HOME/.local/share/pnpm/store"`. (Aven keeps `.pnpm-store` out of git and out of snapshots anyway, but a store in the repository still costs disk and time.)
- **Quiet commands.** Installs and builds can print a great deal; add `--reporter=silent`, `--silent` or `> /dev/null` where a tool allows it, so the log of a failure is short enough to read.
- Keep it short. Install what a thread needs to start working, not everything the project could ever use.

Then make it executable: `chmod +x .aven/setup`.

## 3. Optional: `.aven/resume`

If a thread needs something quick each time its container starts (a login, a cache refresh, a service started in the background), put it in an executable `.aven/resume`. It runs at every container start and the agent waits for it for at most 10 seconds. Do not put installs in it. Most repositories do not need one.

### A database the project needs

Every process the setup script starts is stopped when it ends, so a database is never left running in the snapshot. And `sudo` works only in the setup container: thread containers run with `no-new-privileges`, so `.aven/resume` runs as the plain user `node`. Split the work:

- **`.aven/setup` installs the server** with `sudo apt-get install -y --no-install-recommends postgresql`, and the project's dependencies as usual.
- **`.aven/resume` runs a server of its own as `node`**, with no `sudo`: a data directory in the home folder, started on a socket in `/tmp` (the default one is not writable) and reached over `localhost`. It makes the data directory and the database only when they are missing, so it can run any number of times and takes a fraction of a second:

  ```bash
  #!/usr/bin/env bash
  set -euo pipefail
  PGBIN=$(ls -d /usr/lib/postgresql/*/bin | tail -1)
  PGDATA="$HOME/pgdata"
  [ -d "$PGDATA" ] || "$PGBIN/initdb" -D "$PGDATA" -U app --auth=trust > /dev/null
  "$PGBIN/pg_ctl" -D "$PGDATA" status > /dev/null \
    || "$PGBIN/pg_ctl" -D "$PGDATA" -l "$HOME/pgdata.log" -w -o "-c unix_socket_directories=/tmp" start > /dev/null
  "$PGBIN/psql" -h localhost -U app -d postgres -tc "SELECT 1 FROM pg_database WHERE datname='app'" | grep -q 1 \
    || "$PGBIN/createdb" -h localhost -U app app
  ```

- **The connection string** is `postgres://app@localhost/app`, as a project environment variable (`DATABASE_URL`) or, for local-only values, in the copied `.env.example`.
- **The data lives in the container, not in the workspace.** When a thread's container is freed after it has been idle and comes back, it starts from the snapshot's image, so the thread's own tables and rows are gone. Migrations and seed data must be safe to run again, and the agent runs them again when it comes back to a thread.
- **Migrations run in the thread**, not in `resume`: the agent runs the project's own command (for example `bun run db:migrate`) before it needs the schema.

`save_environment` runs only `.aven/setup`. `.aven/resume` runs when a thread's container starts, so check the database in a new thread (the agent's `list_ports` shows 5432, and a `psql` query answers).

## 4. Save it

Call `save_environment`. It can take many minutes. If it fails, the error holds the end of the script's output: read it, fix `.aven/setup`, and call it again. Common causes are a package name that is wrong for Debian, a missing `sudo`, a tool that needs a newer version than the apt one, and a command that asks a question.

## 5. Tell the user

When it is saved, say in a few lines:

- what the script installs;
- that new threads on this repository now start from the snapshot;
- that **the `.aven` folder must be committed** (the user ships it with their Ship button, or you can commit it if they ask), because the snapshot is made again from the repository's script after 72 hours and when it changes;
- that the next step is `/setup-ship`, which sets up how this repository's changes are shipped.

Do not commit or push anything yourself unless the user asks.
