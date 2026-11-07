import { Elysia } from "elysia";

export class NotFoundError extends Error {}
export class UnprocessableError extends Error {}
export class UnavailableError extends Error {}
export class ConflictError extends Error {}
export class ForbiddenError extends Error {}

export function orNotFound<T>(value: T | null | undefined, message: string): T {
  if (value === null || value === undefined) throw new NotFoundError(message);
  return value;
}

export const describeError = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

export const errorsRouter = new Elysia({ name: "errors" }).onError(
  { as: "global" },
  ({ code, error, status }) => {
    if (error instanceof NotFoundError) return status(404, error.message);
    if (error instanceof UnprocessableError) return status(422, error.message);
    if (error instanceof UnavailableError) return status(503, error.message);
    if (error instanceof ConflictError) return status(409, error.message);
    if (error instanceof ForbiddenError) return status(403, error.message);
    if (code !== "UNKNOWN") return;
    console.error(error);
    return status(500, "Internal server error");
  },
);
