# Aven is licensed under the AGPL-3.0

Status: accepted.

## Context

The repository had no license, which leaves everyone without the right to use, change or run it, however it is shared. Aven is meant to be self-hosted, and a modified copy offered as a hosted service is the case a license has to speak to.

## Decision

- The project is under the GNU Affero General Public License, version 3 only (`AGPL-3.0-only`): `LICENSE` has the license's text, each `package.json` says `"license": "AGPL-3.0-only"`, the server and web images carry `org.opencontainers.image.licenses`, and the README says so.
- The AGPL differs from the GPL in one thing that matters here: a person who runs a modified Aven for others over a network must offer those users its source. Running an unmodified Aven for oneself or a team, as the install guide describes, asks nothing more.

## Consequences

- Contributions come in under the same license.
- A dependency must be compatible with the AGPL; adding one under a license that is not should be raised before it is added.
- Anyone who wants Aven under other terms needs the copyright holders' agreement.
