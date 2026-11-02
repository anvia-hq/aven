# Running Aven on a server in the cloud

A server that other people can reach should be reachable only the way you intend. `aven install`
makes that a choice and starts safe.

## Pick how it is reached

| You want                               | Install with                                                                                  | What listens                                                 |
| -------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Only you, on this machine              | `aven install`                                                                                | `127.0.0.1` only                                             |
| A public server with HTTPS             | `aven install --domain aven.example.com --owner-email you@example.com`                        | ports 80 and 443; the certificate is automatic               |
| A private network (Tailscale, a VPN)   | `aven install --bind 100.64.0.7 --owner-email you@example.com`                                | that address, over plain HTTP: the network is the encryption |
| Behind your own proxy or load balancer | `aven install --origin https://aven.example.com --bind 0.0.0.0 --owner-email you@example.com` | the proxy serves HTTPS and passes `/` to the port            |

A server others can reach starts with **sign-ups closed**: only the owner email you give can make
the first account, so nobody else can take the server before you do. Invite people from
**Settings > Members**; **Settings > Platform** opens sign-ups if you want them open.

## A public server, step by step

1. Create the machine and point a DNS name at it.
2. In the cloud firewall (security group) open **80 and 443 and nothing else**. Aven's API (2837),
   its database and the sandboxes are not meant to be reached from outside, and are published on
   the machine itself or not at all.
3. Install: `curl -fsSL https://raw.githubusercontent.com/anvia-hq/aven/main/install.sh | bash -s -- --domain aven.example.com --owner-email you@example.com`
4. Open `https://aven.example.com`, register with that email, and add a model provider.
5. Run `aven doctor`: it should say `HTTPS for aven.example.com` and that sign-ups are closed.

## Runners

A runner is a computer with Docker that connects out, so it needs no open port. Install more from
**Settings > Runtimes** as in [Self-hosting](self-hosting.md#more-runners). The runner `aven install`
puts beside the server shares its machine: agents run commands in sandboxes there. For a server
many people use, prefer `aven install --no-runner` on the server and runners on other machines.

## Changing an install

Settings are in `~/.aven/server/.env`; edit and run `aven restart`.

- `AVEN_BIND`: `127.0.0.1` this machine only, `0.0.0.0` every address, or one address. Empty means
  every address, which is how an install from before this setting behaves.
- `AVEN_REGISTRATION`: `open` or `closed` until an owner chooses in Settings > Platform.
- `PLATFORM_OWNER_EMAILS`: more owners.

`aven update` never changes how open an existing install is. `aven doctor` warns about plain HTTP
open to a network and about open sign-ups on a server others can reach.

## Good to know

- Sign-in and sign-up attempts are limited to 3 every 10 seconds per address. The count is kept in
  memory, so it starts again when the server restarts.
- Take backups ([Self-hosting](self-hosting.md#backup-and-restore)) and keep `.env` with them.
- Plain HTTP across the internet sends passwords in the clear: use `--domain`, or put a VPN or an
  HTTPS proxy in front.
