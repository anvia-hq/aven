import { Elysia } from "elysia";

import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnavailableError,
  UnprocessableError,
} from "./errors";

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
