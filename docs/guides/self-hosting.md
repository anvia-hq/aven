# Self-hosting

## How it works

```
   you ── browser ──► ┌────────────────────────┐
                      │ Aven server            │ ──► your model providers
                      │ web app · API · Postgres│     (OpenAI, Anthropic, Azure, ...)
                      └───────────▲────────────┘
                                  │ runners connect out
                  ┌───────────────┴───────────────┐
          ┌───────┴───────┐               ┌───────┴───────┐
          │ runner        │               │ runner        │   a laptop, a build
          │ git + folders │               │ git + folders │   machine, a VM ...
          │ works here    │               │ works here    │
          └───────────────┘               └───────────────┘
```

The **server** holds accounts, projects, threads and the encrypted keys. A **runner** is any computer
with git that connects out to the server (so it needs no open port) and works on that machine itself,
as the user running it, in the folders it serves. A project is one of those folders. `aven` installs
and updates both; Docker is needed only for the server, which runs in containers.

## Where things live

Everything lives in `~/.aven`: the server's `.env` with its secrets, the runner's settings and log,
and the runner's workspaces in `~/.aven/runtime`. A checkout used for development keeps its own state
in the project's git-ignored `.aven/` instead (see [Development](../../README.md#development)), so the two never mix.

## Who can reach it

A new install is reachable from **this machine only** (`127.0.0.1`). To let others in, choose how:
`--domain aven.example.com` serves HTTPS (open ports 80 and 443; Caddy gets and renews the
certificate), `--bind <address>` publishes plain HTTP on one address for a VPN or a proxy in front.
A server others can reach starts with sign-ups closed and needs `--owner-email`:

```sh
curl -fsSL https://raw.githubusercontent.com/anvia-hq/aven/main/install.sh | bash -s -- \
  --domain aven.example.com --owner-email you@example.com
```

Runners on other machines then connect over `wss://`, so their tokens never cross the network in the
clear. The full checklist for a server in the cloud is in [Cloud](cloud.md); `aven doctor` shows
what is open.

## More runners

One server can have any number of runners: a laptop, a build machine, a cloud VM. In **Settings >
Runtimes** create a runner, copy its token and run this on the machine:

```sh
curl -fsSL https://raw.githubusercontent.com/anvia-hq/aven/main/install.sh | bash -s -- \
  --runner --url https://aven.example.com/api --token avrt_...
```

The runner works in its user's home folder. To serve other folders, add `--dir <folder>` (or
several, separated by `:`) to `aven runner install`; it is saved as `AVEN_DIRS`. A runner needs no
Docker. The server's own built-in runner serves folders too: `AVEN_LOCAL_RUNNER` in
`~/.aven/server/.env` turns it `on`, `off` or `host`, and `AVEN_DIRS` there sets its folders.

A runner is private to the person who registered it until they turn on **Share** in **Settings >
Runtimes**; sharing lets workspace members run commands on it as its user.

## A boat.dev sandbox

**Settings > Runtimes** can add a [boat.dev](https://boat.dev) sandbox instead of a computer you
install. Create an API key that can create and drive sandboxes
([API keys](https://docs.boat.dev/api-keys)) and paste it there. It is stored encrypted with the
other provider keys and is not an environment variable.

The sandbox runs `aven runner` and connects out to this server, so the server has to be reachable
from the public internet. When `BETTER_AUTH_URL` is a localhost or private address, set
`AVEN_BOAT_RUNNER_URL` to the public one, for example `https://aven.example.com/api`. A paid
sandbox keeps running, and billing, until you revoke the runtime. A free trial stops after two
hours and the next thread resumes it. A project chooses it like any other runtime.

## Update

Run the install command again, or:

```sh
aven update
```

It moves the `aven` command, the server and the runner on that machine to the latest release (never
a prerelease): settings and secrets are kept, new settings are added, the new images are pulled and
the database is migrated when the server starts. A server's runners are updated one machine at a
time, the same way; Settings > Runtimes marks a runner that is behind with "Update available".
The images of earlier releases are removed afterwards. `aven update --release 0.3.0` installs a specific release. Migrations only go forward, so take a
backup before updating (below) if you may want to go back.

## Backup and restore

Two things hold a server's data, and a backup needs both.

**The database.** Your projects, threads, transcripts, settings and keys are in one Postgres
database. Back it up with:

```sh
docker compose --project-directory ~/.aven/server -f ~/.aven/server/docker-compose.yml \
  exec -T postgres pg_dump -U aven aven > aven-backup.sql
```

and restore into an empty database with `psql -U aven -d <database> < aven-backup.sql` run the same
way. Keep `~/.aven/server/.env` with it: the encryption key in it is what makes the stored provider
keys, variables and GitHub App readable.

**The agent's memory of each thread.** The agent runs in the server's built-in runner, and what it
remembers of a thread (the model's own history, which is more than the transcript you read) is in
that runner's home, `~/.aven/runtime` (or `AVEN_RUNTIME_HOME`): `runs.db` and `runs.db.state`.
Restore a database without them and every thread keeps its transcript, but its agent starts
the next message with no memory of the earlier ones. The files are SQLite and change while the
runner works, so stop the runner first and copy them all:

```sh
aven runner stop
cp -a ~/.aven/runtime/runs.db* /path/to/backup/
aven runner start
```

The working folders of threads (`~/.aven/runtime/workspaces`, and the same folder on each other
runner) are copies of your repositories plus whatever the agent has not yet pushed: back them up too
if you would lose work without them.

`aven stop` and `aven update` keep the database and the runner's home; `aven uninstall --purge`
deletes them.

## Security

Good to know: agents act without asking for approval for each step, and nothing is isolated: a
thread's commands run on the runner's machine as the user running it, with that user's files, keys
and network. Use machines you own, ideally with a dedicated unprivileged user for the runner. A
runner is private to its owner until they share it, and a member who may use a shared runner runs
commands as that user. Invite people you trust, and keep sign-up closed unless you want it open. Plain HTTP across a network is not private: see [Cloud](cloud.md).
