import { Elysia } from "elysia";

// Services throw these for expected failures; `errorsRouter` turns each kind into its status once,
// so routers do not repeat the same try/catch.

/** What the request names does not exist (404). */
export class NotFoundError extends Error {}
/** The request is well-formed but cannot be done (422). */
export class UnprocessableError extends Error {}
/** Something the request depends on is not available right now (503). */
export class UnavailableError extends Error {}
/** The request clashes with the current state (409). */
export class ConflictError extends Error {}

/** What went wrong, in words: an Error's message, or whatever else was thrown as text. */
export const describeError = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

// Global, so it covers every router mounted after it. Anything else is logged and answered
// generically: an unexpected error's message must not reach the client.
export const errorsRouter = new Elysia({ name: "errors" }).onError(
  { as: "global" },
  ({ code, error, status }) => {
    if (error instanceof NotFoundError) return status(404, error.message);
    if (error instanceof UnprocessableError) return status(422, error.message);
    if (error instanceof UnavailableError) return status(503, error.message);
    if (error instanceof ConflictError) return status(409, error.message);
    if (code !== "UNKNOWN") return;
    console.error(error);
    return status(500, "Internal server error");
  },
);
