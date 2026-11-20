import { describe, expect, test } from "bun:test";
import { Elysia } from "elysia";

import {
  ConflictError,
  describeError,
  ForbiddenError,
  NotFoundError,
  orNotFound,
  UnavailableError,
  UnprocessableError,
} from "./errors";
import { errorsRouter } from "./errors-router";

const respond = (error: Error) =>
  new Elysia()
    .use(errorsRouter)
    .get("/x", () => {
      throw error;
    })
    .handle(new Request("http://localhost/x"));

describe("error classes and helpers", () => {
  test("each error class sets its own name", () => {
    expect(new NotFoundError("a").name).toBe("NotFoundError");
    expect(new UnprocessableError("b").name).toBe("UnprocessableError");
    expect(new UnavailableError("c").name).toBe("UnavailableError");
    expect(new ConflictError("d").name).toBe("ConflictError");
    expect(new ForbiddenError("e").name).toBe("ForbiddenError");
  });

  test("orNotFound returns defined values and throws NotFoundError for null or undefined", () => {
    expect(orNotFound(0, "missing")).toBe(0);
    expect(orNotFound("", "missing")).toBe("");
    expect(orNotFound(false, "missing")).toBe(false);
    expect(orNotFound({ id: 1 }, "missing")).toEqual({ id: 1 });
    expect(() => orNotFound(null, "no row")).toThrow(NotFoundError);
    expect(() => orNotFound(undefined, "no row")).toThrow("no row");
  });

  test("describeError formats Error instances and arbitrary thrown values", () => {
    expect(describeError(new Error("boom"))).toBe("boom");
    expect(describeError(new ForbiddenError("denied"))).toBe("denied");
    expect(describeError("plain string")).toBe("plain string");
    expect(describeError(42)).toBe("42");
  });
});

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
