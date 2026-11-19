# Sandbox providers are their own package

Status: accepted. Adds to 0220 (runtime providers) and 0299, 0306 (Aven Cloud is a list of providers).

## Context

Adding the spaces provider (0306) meant copying boat's folder and then editing, in addition, the
files that knew about both: `runtimes/providers.ts` (the registry, the lifetime check in
`reachRunner`, the stop route, the destroy the sweep calls), `runtimes/cloud-config.ts` (the
provider table and `AVEN_CLOUD_PROVIDERS`) and `runtimes/cloud-expiry.ts` (an `if` on
`provider === "spaces"`). The code and its tests also sat inside `apps/control-plane`, so a provider
was a part of the API server by construction and could not be read, or tested, on its own.

## Decision

- The providers and the cloud plumbing they share live in a new workspace package, `@aven/sandbox`,
  in a top-level `sandbox/` directory: `src/boat/`, `src/spaces/`, and one folder per provider after
  that. Each has its own client, settings and `module.ts`.
- One `CloudProviderModule` per provider says everything the shared code needs: `apiKey`, `ready`,
  `create`, `stop`, `removeSandbox` and `lifetime`. `src/cloud-config.ts` holds the registry — one
  line per provider, naming its template runtime id and its module — and `AVEN_CLOUD_PROVIDERS` is
  parsed against those names, so a name that is not a provider is refused as before. A new provider
  is a folder plus that line.
- The package holds no database: the control plane lends it a `SandboxStore` (`record`,
  `saveSandboxId`, `providerOf`, `isExpiredCloud`) and the sweep its idle rows. `reachRunner`,
  `releaseThread`, `stopCloudRuntime` and `createCloudExpiry` take those through a factory, and
  `runtimes/providers.ts` and `runtimes/cloud-expiry.ts` stay in the app as the wiring.
- The provider interface is generic in the runner's connection type, so the package never imports
  the control plane's `RuntimeConnection`: the app instantiates it once with its own type, and the
  package's own tests use a fake with a `call`.
- `RuntimeOfflineError` and the two flag helpers (`featureChoice`, `featureList`, now in
  `@aven/server-kit/features`) moved with the code that needed them. `runtimesService` gained a
  generic `cloudRecord(id, provider)` where `boatRecord` and `spacesRecord` were, and
  `AVEN_CLOUD_PROVIDERS`, `AVEN_BOAT_*`, `AVEN_SPACES_*`, the API/DB shapes and the UI labels are
  unchanged.

## Consequences

- A provider can be read and tested without the control plane; the package's tests run with no
  database.
- The registry, the lifetime check and the expiry sweep ask every provider instead of naming two, so
  stopping or expiring a runtime costs one record lookup per provider (two today, as before).
- The expiry sweep deletes a sandbox through the provider its row records. A row of a provider
  without a `removeSandbox` entry is expired without a sandbox being deleted; no such row exists,
  since only cloud providers write a sandbox id.
- `apps/control-plane/Dockerfile` copies the package, and CI runs `bun test apps packages sandbox
  tooling`.
