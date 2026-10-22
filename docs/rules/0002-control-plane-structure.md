# Control plane structure

Status: accepted

Applies to `apps/control-plane` (Elysia on Bun, zod, `@aven/db`).

## Modules

Each feature is a folder in `src/modules/<module-name>/` (kebab-case) with exactly:

```
router.ts    Elysia instance: routes only, no business logic
schema.ts    zod schemas (params, body, query) and their inferred types
service.ts   business logic and database access
```

- `router.ts` calls the service and validates with the schemas. It never touches `db` directly.
- `service.ts` knows nothing about HTTP. Return data or `null`; let the router map that to a status.
- `schema.ts` is zod only (Elysia accepts zod through Standard Schema). Do not use `t` from Elysia.
- Export a single `<name>Router` from `router.ts` and a `<name>Service` object from `service.ts`.

## Chaining

Build routers with a single method chain: `new Elysia({ prefix }).get().post().patch()`. Do not assign the instance and call methods on it in separate statements, because that loses type inference.

## Wiring

`src/index.ts` is the entry point. It creates the app and mounts routers with `.use(<name>Router)`. It exports `type App` for typed clients. No barrel files.

## Errors

Return `status(404, "message")` from `elysia` for expected errors. Validation errors are handled by Elysia (422).

## Config

Read config from `process.env` (root `.env`, loaded via `--env-file`). Add every new variable to `.env.example`.
