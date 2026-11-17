# sandbox

How a runtime's machine comes to exist, and is woken, stopped and freed: the Aven Cloud providers
(`boat`, `spaces`) and the plumbing they share. `@aven/sandbox` is a workspace package, shipped as
TypeScript source; the control plane imports it and lends it the database.

Decision: `docs/decision/0307-sandbox-providers-are-their-own-package.md`.

## Layout

| File                       | What it holds                                                                                 |
| -------------------------- | --------------------------------------------------------------------------------------------- |
| `src/types.ts`             | The interfaces: `SandboxProvider`, `CloudProviderModule`, `SandboxStore`, `SandboxRecord`.    |
| `src/cloud-config.ts`      | The registry: one entry per provider (template runtime id, module), and which are offered.    |
| `src/runtime.ts`           | `reachRunner`, `releaseThread`, `stopCloudRuntime` over a `SandboxStore`.                     |
| `src/cloud-expiry.ts`      | The 48-hour sweep over idle Aven Cloud computers.                                             |
| `src/cloud-id.ts`          | The runtime ids of the Aven Cloud templates, which rows already name.                         |
| `src/settings.ts`          | `SANDBOX_PROVIDERS` and the one saved sandbox (`SandboxSettings`) the control plane hands in. |
| `src/offline.ts`           | `RuntimeOfflineError`.                                                                        |
| `src/boat/`, `src/spaces/` | One provider each: its client, boot script, wake flow, stop, lifetime and `module.ts`.        |

A provider imports nothing of the other's. The tests sit beside what they cover.

## Adding a provider

1. Make `src/<name>/`: a client of that service's API, its settings (`src/<name>/config.ts`, read
   from `sandboxSettingsOf(name)`), and a `module.ts` exporting a `CloudProviderModule` — `apiKey`, `ready`,
   `create`, `stop`, `removeSandbox` and `lifetime` (`src/types.ts`). `create` is what wakes a
   sandbox and returns the runner's connection; `stop` stops one; `removeSandbox` deletes one and
   answers `false` when it cannot yet, which the sweep retries.
2. Take a free template runtime id in `src/cloud-id.ts`.
3. Its name in `SANDBOX_PROVIDERS` in `src/settings.ts`, and one line in `CLOUD_PROVIDERS` in
   `src/cloud-config.ts`, naming the provider with that id and its
   module.

That is all: Settings > Sandbox accepts the name, Aven Cloud offers a template for it once
`ready()` is true, and `reachRunner`, the expiry sweep and the runtime delete route reach it by the
provider its rows record.

The database is not here. `apps/control-plane/src/modules/runtimes/providers.ts` gives this package a
`SandboxStore` over `runtimesService` (`cloudRecord`, `setBoatSandbox`, `providerOf`,
`isExpiredCloud`), and `apps/control-plane/src/modules/runtimes/cloud-expiry.ts` gives the sweep its
idle rows. A provider's rows are the shared `runtimes` columns (`boat_sandbox_id`,
`boat_runner_token_encrypted`, `boat_machine_type`), whose names a migration would have to change.
