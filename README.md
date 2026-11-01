# Aven

Aven runs AI coding agents on your own machines. A control plane (API, web app, database) hands each
thread to a **runner**, a computer with Docker that gives the agent a sandbox with a desktop, a
terminal and your repository.

## Install

macOS or Linux, with nothing installed beforehand:

```sh
curl -fsSL https://raw.githubusercontent.com/anvia-hq/aven/main/install.sh | bash
```

It installs what is missing (git and Docker, after asking), then the `aven` command, then the
server and a runner on this machine, and opens Aven in your browser. Create your account, add an AI
provider in Settings and start a thread. On Windows, use WSL2.

Everything lives in `~/.aven`: the server's `.env` with its secrets, the runner's settings and log,
and the runner's workspaces in `~/.aven/runtime`. A checkout used for development keeps its own state
in the project's git-ignored `.aven/` instead (see Development), so the two never mix.

## Connect GitHub

Projects are GitHub repositories. In **Settings > Platform** (as the owner whose email you gave the
installer) press **Create GitHub App**: GitHub asks you to confirm the app's name and permissions
and to install it on your account or organization, and Aven keeps the credentials itself. Nothing
to copy into `.env`. Then each person presses **Connect GitHub** once, so that what the agent
pushes and the pull requests it opens are theirs.

Things to know:

- GitHub app names are unique across GitHub. Aven suggests `Aven (<your host>)`, which is the same
  for every install on `localhost`, so you will probably have to pick another name on GitHub's
  confirmation page. Give the **Organization** field a name if a GitHub organization should own the
  app rather than you.
- By default the app is private: only the account or organization that owns it can install it. To
  install it on several organizations, turn on **Allow installing on other accounts and
  organizations** before pressing Create. For an app that already exists, make it public in its
  settings on GitHub (**Advanced > Make public**). Public only means anyone may install it; nobody can
  use it without this server's credentials. Either way an organization's owner may have to approve
  the install, because the app asks for write access to code and pull requests.
- If you would rather make the app yourself, set the `GITHUB_APP_*` variables in
  `~/.aven/server/.env` (see [`.env.example`](.env.example)); an app set there is used instead.
- This flow has been tested against a stand-in for GitHub, not yet against github.com.

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
`aven update --release 0.3.0` installs a specific release. Migrations only go forward, so take a
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

## Troubleshooting

Start with `aven doctor`: it checks Docker, git, the server, the runner and its sandbox image.

| What you see                             | What to do                                                                                                                                                                                                              |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Docker is installed but not running`    | Start Docker Desktop or OrbStack (macOS), or `sudo systemctl start docker` (Linux), then run the command again.                                                                                                         |
| `Port 3000 is in use` (or 3030, 80, 443) | Pick another with `--port`, `--api-port` or `--https-port`.                                                                                                                                                             |
| The server does not answer               | `aven server logs`. The first start can take a minute; `aven restart` after editing `.env`.                                                                                                                             |
| A runner shows Offline in Settings       | `aven runner status`, then `aven runner logs --follow` on that machine. `aven runner start` if it is stopped.                                                                                                           |
| `The control plane refused this runtime` | The token was revoked or rotated, or the runner is older than the server (`Unsupported runtime version`): add a runtime again in Settings > Runtimes and run its command, or run `aven update` on the runner's machine. |
| `Cannot reach the control plane`         | The `--url` is wrong or blocked. It is the server's address followed by `/api`.                                                                                                                                         |
| `Could not pull ...aven-sandbox...`      | The image is large (several GB) and comes from GHCR; check your network, then run `aven runner install` again.                                                                                                          |
| A thread cannot start a sandbox          | `docker info` must work for the user who installed the runner, and the runner's log says which image or command failed.                                                                                                 |

Where things are: `~/.aven/server/.env` (settings and secrets), `~/.aven/runner.env` (the runner),
`~/.aven/logs/runner.log`, the runner's workspaces in `~/.aven/runtime` (`AVEN_RUNTIME_HOME`), and the
database in the Docker volume `aven_postgres`. `AVEN_HOME` moves the settings, server files and logs
but not `AVEN_RUNTIME_HOME`, which has to be set as well to move the runner's workspaces.

## The `aven` command

```
aven install [--domain D] [--port N] [--owner-email E]     server + runner on this machine
aven install --runner --url <address> --token <token>      only a runner
aven start | stop | restart | status | logs [--follow]     the server
aven runner start | stop | restart | status | logs | uninstall
aven update [--release X]
aven doctor                                                check Docker, git, the server and the runner
aven uninstall [--purge --yes]                             remove the services; --purge also deletes the data
```

`aven stop` keeps the database. Settings are in `~/.aven/server/.env`; edit it and run
`aven restart`. See [`deploy/env.example`](deploy/env.example) for what each one does.

## Development

Bun workspace monorepo; read [AGENTS.md](AGENTS.md) first, and `docs/` for rules and decisions.

```sh
bun install
createdb aven
cp .env.example .env     # then fill it in, with AVEN_RUNTIME_HOME=<this checkout>/.aven/runtime
bun run dev
```

Install and release design: [docs/decision/0073](docs/decision/0073-install-and-update-with-a-script.md)
and [0074](docs/decision/0074-the-github-app-is-created-from-the-platform.md). How to make a release
and what a change must keep true for `aven update`: [docs/rules/0005-releasing.md](docs/rules/0005-releasing.md).
