import { describe, expect, test } from "bun:test";
import { Elysia } from "elysia";

import {
  ConflictError,
  errorsRouter,
  ForbiddenError,
  NotFoundError,
  UnavailableError,
  UnprocessableError,
} from "./errors";

const respond = (error: Error) =>
  new Elysia()
    .use(errorsRouter)
    .get("/x", () => {
      throw error;
    })
    .handle(new Request("http://localhost/x"));

describe("errorsRouter", () => {
  test("maps each expected error to its status and keeps the message", async () => {
    const cases = [
      [new NotFoundError("gone"), 404],
      [new UnprocessableError("bad"), 422],
      [new UnavailableError("offline"), 503],
      [new ConflictError("busy"), 409],
      [new ForbiddenError("not yours"), 403],
    ] as const;
    for (const [error, expected] of cases) {
      const res = await respond(error);
      expect(res.status).toBe(expected);
      expect(await res.text()).toBe(error.message);
    }
  });

  test("an unexpected error is a generic 500 that leaks nothing", async () => {
    const original = console.error;
    console.error = () => {};
    try {
      const res = await respond(new Error("db password is hunter2"));
      expect(res.status).toBe(500);
      expect(await res.text()).toBe("Internal server error");
    } finally {
      console.error = original;
    }
  });

  test("leaves Elysia's own errors (such as 404) alone", async () => {
    const res = await new Elysia().use(errorsRouter).handle(new Request("http://localhost/nope"));
    expect(res.status).toBe(404);
  });
});
