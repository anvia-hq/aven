# The control plane throws typed errors for expected failures

Status: accepted. Changes the Errors section of rule 0002, which said to return `status(404, "message")`.

## Context

Rule 0002 asked services to return data or `null` and routers to map `null` to `status(404, "message")`. Most of the control plane had since moved on: services throw the errors of `src/errors.ts` (`NotFoundError`, `UnprocessableError`, `ConflictError`, `ForbiddenError`, `UnavailableError`) and one global `onError`, `errorsRouter`, turns each into its status with the error's message. A few routers still returned `?? status(404, ...)`, so a reader met two ways of saying the same thing, and a check that lived in a router (such as who may open a thread's terminal) could not be reused by a service.

## Decision

- **An expected failure is a typed error from `src/errors.ts`, thrown.** A service throws it where it finds the failure. Where a service answers `null` for "not there" and its callers rely on that, the router throws: `orNotFound(value, "Thing not found")` for a value, `throw new NotFoundError(...)` for a boolean.
- **`errorsRouter` is the one place that maps an error to a status.** It answers with the status and the message as plain text, exactly as `status(code, message)` does, so moving from one to the other changes no response.
- **`status(...)` stays for what is not an error of ours:** a success status such as 202, a 401 (there is no typed error for it: authentication is Better Auth's and the run credentials'), and the checks Elysia runs before a handler (`resolve` and `beforeHandle` of authentication and of a WebSocket's origin), which stop a request without a service.

## Consequences

- Routers hold routes only; authorization and lookups live in services and helpers, where other callers can use them.
- A test that mounts a router alone must mount `errorsRouter` too, or a thrown error is a 500.
- The platform router's owner check still returns `status(...)` for a 403; it is left as it is for now and follows this when next changed.
