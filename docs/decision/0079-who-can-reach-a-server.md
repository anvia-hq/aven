# Who can reach a server

Status: accepted. Extends 0073 (install and update with a script) and 0077 (the first account is the platform owner).

## Context

The compose file published the web port on every address and `aven install` served plain HTTP unless given a domain. On a laptop that exposed the sign-in page to the Wi-Fi, and on a cloud VM it sent passwords in the clear. With 0077 the first account to register owns the server, so on an open, reachable server whoever got there first owned it. People will install this in the cloud, so who can connect has to be a choice made at install, not a default.

## Decision

- **Exposure is an explicit choice, loopback by default.** `AVEN_BIND` is the address the web port is published on. A new install uses `127.0.0.1`; `--domain` uses `0.0.0.0` (Caddy needs 80 and 443 reachable for its certificate); `--bind <ipv4>` says where, such as a Tailscale address, for a VPN or an HTTPS proxy in front. A plain-HTTP bind that is not loopback prints a warning that sign-ins are not encrypted. Only IPv4 addresses are accepted.
- **A server others can reach starts closed.** `AVEN_REGISTRATION=closed` is what registration is until an owner chooses in Settings > Platform (their choice, a row in `platform_settings`, wins). The installer sets it for `--domain` and any `--bind` that is not loopback, and then requires `--owner-email`: with registration closed only a listed owner can make the first account, so a stranger cannot win the race for ownership and someone always can register. `--owner-email` is asked for when the terminal can. An install for this machine only stays open.
- **An install from before a setting behaves as it did.** `addMissingKeys` gives a key an old `.env` lacks the value the install had before the key existed (`SETTINGS_BEFORE` in `env-file.ts`: `AVEN_BIND` empty, every address) and not the template's, which is for new installs. The compose file leaves the address out when `AVEN_BIND` is empty, which keeps IPv4 and IPv6 as they were. Updating never makes an install more or less open.
- **`aven doctor` says what is open.** It warns, and does not fail, when plain HTTP is open to a network, when a domain's certificate port is closed, and when sign-ups are open on a server others can reach; sign-ups come from the server (`/platform/config`), since the owner's setting wins over the install's.

## Consequences

- A person who wants LAN access on a laptop sets `AVEN_BIND=0.0.0.0` in `~/.aven/server/.env` and runs `aven restart`; `doctor` will say it is plain HTTP.
- Runners on other machines of a server bound to loopback cannot reach it. They need `--domain`, or `--bind` with a VPN or proxy.
- `portIsFree` now tries loopback as well as the wildcard, since a listener on `127.0.0.1` alone does not stop a wildcard bind on macOS but does stop Docker's; and updating to a dev build or `latest` removes no images.
- Better Auth limits sign-in and sign-up to 3 attempts per 10 seconds per address in production, in memory (it resets when the server restarts). The address comes from `X-Forwarded-For`, which Caddy sets.
- Not covered: a firewall (the guide says which ports), a runner on the same VM as the server (a host process with Docker access), TLS in front of a load balancer.
