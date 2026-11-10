import { describe, expect, test } from "bun:test";

import { Elysia } from "elysia";

import { foreignOrigin } from "./origin-guard";

const trusted = ["https://aven.example"];
const request = (method: string, origin?: string) =>
  new Request("http://localhost/wake", {
    method,
    headers: origin === undefined ? {} : { origin },
  });

describe("a request that changes something", () => {
  test("is refused from an origin Aven does not trust, as from a page of the Browser", () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(foreignOrigin(request(method, "https://aven.example:8444"), trusted)?.status).toBe(
        403,
      );
    }
    expect(foreignOrigin(request("POST", "null"), trusted)?.status).toBe(403);
  });

  test("is let through from the platform, and from a client that sends no origin", () => {
    expect(foreignOrigin(request("POST", "https://aven.example"), trusted)).toBeUndefined();
    expect(foreignOrigin(request("DELETE"), trusted)).toBeUndefined();
  });

  test("is not checked when it only reads", () => {
    for (const method of ["GET", "HEAD", "OPTIONS"]) {
      expect(foreignOrigin(request(method, "https://elsewhere.test"), trusted)).toBeUndefined();
    }
  });
});

describe("in an Elysia app", () => {
  test("a refused request never reaches its route", async () => {
    let reached = 0;
    const app = new Elysia()
      .onRequest(({ request }) => foreignOrigin(request, trusted))
      .post("/wake", () => {
        reached++;
        return "ok";
      });
    const refused = await app.handle(request("POST", "https://aven.example:8444"));
    expect(refused.status).toBe(403);
    expect(reached).toBe(0);
    const allowed = await app.handle(request("POST", "https://aven.example"));
    expect(await allowed.text()).toBe("ok");
    expect(reached).toBe(1);
  });
});
