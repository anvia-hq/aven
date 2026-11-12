# The control plane starts with an edition

Status: accepted.

## Context

Aven is MIT and open source, and its owner also runs a hosted product with commercial features (plans, billing, usage metering, an admin console, persistent-only runners). Anyone can host the MIT code, so the commercial features have to live in code that is not published. The open code must not know about them, and a self-hosted install must behave exactly as before.

## Decision

- **The control plane is started with an `Edition`**: `startControlPlane(edition)` in `server.ts`. `index.ts` starts the community edition; a private package starts its own.
- **An edition is small**: a name, a list of feature flags, an optional `manageUrl`, and extra `routes` mounted on the app. Nothing is limited today, so it has no policy, metering or lifecycle hooks; each is added, as an optional part with a default that changes nothing, when a limit or a meter needs it.
- **The community edition names itself and adds nothing**, so the open code behaves as it did.
- **Services read `editionInUse.current` when they act**, never at import, because the services are singletons built before the edition is chosen.
- **The commercial code lives in a private repository** that pins Aven at a release tag, keeps its tables in a separate Postgres schema with its own migrations, and builds the hosted image. The open repository never imports it.
- **Commercial screens live outside the open web app**. The platform learns what is allowed from the edition and from a plan-limit error, and links to `manageUrl`.

## Consequences

- This change only adds the seam and moves the boot code; the hosted edition's first features arrive as routes.
- Every extension point is a public interface that self-hosters can depend on, so they stay few and small.
- A fork can rebuild the commercial features; the protection is the private code, the hosted credentials and the Aven name.
