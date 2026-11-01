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
          │ Docker + git  │               │ Docker + git  │   machine, a VM ...
          │ ▢ ▢ ▢ sandboxes               │ ▢ ▢ sandboxes │
          └───────────────┘               └───────────────┘
```

The **server** holds accounts, projects, threads and the encrypted keys. A **runner** is any computer
with Docker and git that connects out to the server (so it needs no open port) and runs a sandbox
for each thread. `aven` installs and updates both.

## Where things live

Everything lives in `~/.aven`: the server's `.env` with its secrets, the runner's settings and log,
and the runner's workspaces in `~/.aven/runtime`. A checkout used for development keeps its own state
in the project's git-ignored `.aven/` instead (see [Development](../../README.md#development)), so the two never mix.

## Your own domain, with HTTPS

For a server that other machines or people reach, point a DNS name at it, open ports 80 and 443 and
install with the name; Caddy gets and renews the certificate:

```sh
curl -fsSL https://raw.githubusercontent.com/anvia-hq/aven/main/install.sh | bash -s -- --domain aven.example.com
```

Runners on other machines then connect over `wss://`, so their tokens never cross the network in the clear.

## More runners

One server can have any number of runners: a laptop, a build machine, a cloud VM. In **Settings >
Runtimes** create a runner, copy its token and run this on the machine:

```sh
curl -fsSL https://raw.githubusercontent.com/anvia-hq/aven/main/install.sh | bash -s -- \
  --runner --url https://aven.example.com/api --token avrt_...
```

## Update

Run the install command again, or:

```sh
aven update
```

It moves the `aven` command, the server and the runner on that machine to the latest release (never
a prerelease): settings and secrets are kept, new settings are added, the new images are pulled and
the database is migrated when the server starts. A server's runners are updated one machine at a
time, the same way; Settings > Runtimes marks a runner that is behind with "Update available".
The images of earlier releases are removed afterwards (a sandbox image is several gigabytes). `aven update --release 0.3.0` installs a specific release. Migrations only go forward, so take a
backup before updating (below) if you may want to go back.

## Backup and restore

Everything lives in one Postgres database. Back it up with:

```sh
docker compose --project-directory ~/.aven/server -f ~/.aven/server/docker-compose.yml \
  exec -T postgres pg_dump -U aven aven > aven-backup.sql
```

and restore into an empty database with `psql -U aven -d <database> < aven-backup.sql` run the same
way. Keep `~/.aven/server/.env` with it: the encryption key in it is what makes the stored provider
keys, variables and GitHub App readable. `aven stop` and `aven update` keep the database;
`aven uninstall --purge` deletes it.

## Security

Good to know: agents act without asking for approval for each step, inside their sandbox. A sandbox
holds only its thread's workspace, but it can reach the network, and any member of an organization can
run commands on the organization's runners. Invite people you trust, and keep sign-up closed unless
you want it open.
