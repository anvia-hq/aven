# Control plane structure

Status: accepted

Applies to `apps/control-plane` (Elysia on Bun, zod, `@aven/db`).

## Modules

Each feature is a folder in `src/modules/<module-name>/` (kebab-case) with these files at its core:

```
router.ts    Elysia instance: routes only, no business logic
schema.ts    zod schemas (params, body, query) and their inferred types
service.ts   business logic and database access
```

- Include only the files a module needs. `auth` has no `schema.ts` because Better Auth owns its request shapes.
- A module may add helper files beside these, named for what they do (`runtimes/gateway.ts`, `threads/messages.ts`, `variables/project-router.ts`), when a service or a router would otherwise grow too large or mix concerns. The rules for each kind of file still apply: a second router is still routes only.
- `router.ts` calls the service and validates with the schemas. It never touches `db` directly.
- `service.ts` knows nothing about HTTP. It returns data, and throws a typed error for an expected failure (see Errors).
- `schema.ts` is zod only (Elysia accepts zod through Standard Schema). Do not use `t` from Elysia.
- Export a single `<name>Router` from each router file and a `<name>Service` object from `service.ts`. A router that needs a long-lived object (the runtime hub, the run manager) is a function taking it.

## Chaining

Build routers with a single method chain: `new Elysia({ prefix }).get().post().patch()`. Do not assign the instance and call methods on it in separate statements, because that loses type inference.

## Wiring

`src/index.ts` is the entry point. It creates the app and mounts routers with `.use(<name>Router)`. It exports `type App` for typed clients. No barrel files.

`src/composition.ts` makes the long-lived objects (the runtime hub, the run manager, the thread messages) once and `src/index.ts` hands them to the routers that need them, so modules that use each other's objects do not import each other.

## Errors

Throw the typed errors of `src/errors.ts` for expected failures (`NotFoundError` 404, `UnprocessableError` 422, `ConflictError` 409, `ForbiddenError` 403, `UnavailableError` 503); `errorsRouter`, mounted first, answers each with its status and message (decision 0055). A service throws them; where a service answers `null` for "not there", the router throws, with `orNotFound(value, "message")`. Keep `status(...)` for success statuses such as 202, for 401, and for the checks run before a handler (authentication, a WebSocket's origin). Validation errors are handled by Elysia (422).

## Config

Read config from `process.env` (root `.env`, loaded via `--env-file`). Add every new variable to `.env.example`.

## Auth

Better Auth lives in `modules/auth/service.ts` (Drizzle adapter, email + password) and is served at `/auth/*` (the platform proxies it as `/api/auth/*`). To protect a route, `.use(authRouter)` and add `{ auth: true }` to the route options; the handler then receives `user` and `session`, and unauthenticated requests get 401.
