# Aven is licensed under the MIT license

Status: accepted.

## Context

The repository had no license, which leaves everyone without the right to use, change or run it, however it is shared. Aven is meant to be self-hosted and built on, and people need to know they may.

## Decision

- The project is under the MIT license: `LICENSE` has its text, each `package.json` says `"license": "MIT"`, the server and web images carry `org.opencontainers.image.licenses` and the text at `/LICENSE`, each release archive holds `LICENSE` beside `aven` (`aven update` and the installer take only `aven` from it), and the README says so. The sandbox image is left out: it is built from its own folder and is mostly other people's software.
- The copyright line names Anvia HQ, the organization that owns the repository.
- The AGPL was first chosen and then replaced by the MIT license before anything was released under it.

## Consequences

- Anyone may use, change, host and sell Aven, closed-source forks and hosted services included, provided the notice stays.
- A dependency under a copyleft license (GPL, AGPL) would ask more of Aven than MIT does, so it is raised before it is added.
- Contributions come in under the same license.
