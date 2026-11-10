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

## The Browser tab

A thread's **Browser** tab shows a page the agent serves in its sandbox (a dev server, a docs site): you type the port, and the page opens beside the conversation. It is **off until you give it an address**, because the page is the agent's own code and must not run on Aven's address, where it could act as you. The tab says "The Browser is not set up on this server" until you do.

The server listens for the Browser on a second port, `127.0.0.1:2839` (`AVEN_BROWSER_PORT`). Give that port an address of its own, different from the one you open Aven at, and tell the server:

```sh
aven server install --browser-origin https://aven.example.com:8444
```

- **On this machine only**, with the default address: `aven server install --browser-origin http://localhost:2839`.
- **On a tailnet**: `tailscale serve --bg --https=8444 http://127.0.0.1:2839`, then `--browser-origin https://<machine name>.<tailnet>.ts.net:8444`.
- **With a domain**: put an HTTPS reverse proxy in front of `127.0.0.1:2839` (it must pass WebSocket upgrades, which hot reload uses) and use its address. An address on another host name than Aven's, such as `https://browser.example.com`, is the safest: a page on the same host name as Aven can set a cookie that signs you out of Aven, though it cannot read your session or act as you.

`aven server install` writes `AVEN_BROWSER_ORIGIN` to the server's `.env` and restarts the server, which ends the runs in progress, so do it when no thread is working. Then open a thread, choose **Browser**, type the port and press Open.

Good to know: one page at a time per browser (opening another port or thread replaces it until you reload), and the page runs in **your** browser, so `localhost` in its code is your own machine: an app must call its own origin (`/api/...`) and let its dev server proxy to the API. The agent is told this. See [decision 0199](../decision/0199-the-browser-shows-a-port-of-the-sandbox.md).

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
you want it open. Plain HTTP across a network is not private: see [Cloud](cloud.md).
