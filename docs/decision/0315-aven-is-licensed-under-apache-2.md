# 0315: Aven is licensed under Apache 2.0

Date: 2026-11-16

Status: accepted. Supersedes 0167 (the MIT license).

## Decision

- The project is under the Apache License 2.0: `LICENSE` has the text from apache.org unchanged, `NOTICE` names Aven and Anvia, each `package.json` says `"license": "Apache-2.0"`, and the server and web images carry `org.opencontainers.image.licenses` and `LICENSE` and `NOTICE` at `/`. Each release archive holds `LICENSE` and `NOTICE` beside `aven`.
- The README names the license, the hosted version and the commercial contact, and says that the Aven and Anvia names and logos are trademarks the license does not grant.
- Contributions come in under Apache 2.0 with a Developer Certificate of Origin sign-off (`git commit -s`). `.github/workflows/dco.yml` fails a pull request with an unsigned commit, and `CONTRIBUTING.md` says so.
- Everything so far was written by the Anvia team, so the relicense needs no one else's consent.

## Why

Aven is meant to be community-first open source, with revenue from a hosted version and paid enterprise extras (0234) rather than from the code license. Apache 2.0 keeps what MIT gave (use, change, host and sell, closed forks included) and adds an explicit patent grant and a trademark clause, which the hosted product needs.

## Consequences

- A dependency whose license asks more than Apache 2.0 does (GPL, AGPL, SSPL) is raised before it is added.
- A copy of Aven must keep `LICENSE` and `NOTICE`, which is why the images and archives carry both.
- The sign-off is a new step for every commit, including those an agent makes.
