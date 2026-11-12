import { afterAll, describe, expect, test } from "bun:test";
import { Elysia } from "elysia";

import { errorsRouter } from "../../errors";
import { mcpRouter } from "./router";

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("the MCP servers routes (real postgres)", async () => {
  const { signUp } = await import("../../testing/sign-up");
  const server = new Elysia().use(errorsRouter).use(mcpRouter).listen({ port: 0 });
  const base = `http://localhost:${server.server?.port}`;
  const alice = await signUp("alice");
  const bob = await signUp("bob");
  afterAll(async () => {
    await server.stop(true);
    await alice.remove();
    await bob.remove();
  });

  const call = (method: string, path: string, token: string | undefined, body?: object) => {
    const headers: Record<string, string> = { "content-type": "application/json" };

    if (token) headers.authorization = `Bearer ${token}`;

    return fetch(`${base}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  };
  const valid = { name: "Notes", url: "https://mcp.example.com/api" };

  test("needs a session", async () => {
    expect((await call("GET", "/mcp-servers", undefined)).status).toBe(401);
    expect((await call("POST", "/mcp-servers", undefined, valid)).status).toBe(401);
  });

  test("makes, lists, changes and removes a server, and never returns a header's value", async () => {
    const made = await call("POST", "/mcp-servers", alice.token, {
      ...valid,
      headers: [{ name: "Authorization", value: "Bearer s3cret" }],
    });
    expect(made.status).toBe(200);
    const created = (await made.json()) as { id: string; headerNames: string[] };
    expect(created.headerNames).toEqual(["Authorization"]);

    const listed = await (await call("GET", "/mcp-servers", alice.token)).text();
    expect(listed).toContain("Notes");
    expect(listed).not.toContain("s3cret");

    const off = await call("PATCH", `/mcp-servers/${created.id}`, alice.token, { enabled: false });
    expect(await off.json()).toMatchObject({ enabled: false });
    expect((await call("DELETE", `/mcp-servers/${created.id}`, alice.token)).status).toBe(200);
    expect((await call("DELETE", `/mcp-servers/${created.id}`, alice.token)).status).toBe(404);
  });

  test("another person's server is not found", async () => {
    const made = await call("POST", "/mcp-servers", alice.token, { ...valid, name: "Mine" });
    const { id } = (await made.json()) as { id: string };
    expect((await call("PATCH", `/mcp-servers/${id}`, bob.token, { enabled: false })).status).toBe(
      404,
    );
    expect((await call("DELETE", `/mcp-servers/${id}`, bob.token)).status).toBe(404);
    expect(await (await call("GET", "/mcp-servers", bob.token)).text()).not.toContain("Mine");
  });

  test("refuses a server that is not a plain http(s) address, and headers it does not own", async () => {
    const refused = async (body: object) =>
      (await call("POST", "/mcp-servers", alice.token, { ...valid, name: "Bad", ...body })).status;
    expect(await refused({ url: "ftp://mcp.example.com" })).toBe(422);
    expect(await refused({ url: "not a url" })).toBe(422);
    expect(await refused({ url: "https://user:pass@mcp.example.com" })).toBe(422);
    expect(await refused({ name: "../etc" })).toBe(422);
    expect(await refused({ headers: [{ name: "Host", value: "evil" }] })).toBe(422);
    expect(await refused({ headers: [{ name: "X-A", value: "one\r\nX-B: two" }] })).toBe(422);
    expect(
      await refused({
        headers: [
          { name: "X-A", value: "1" },
          { name: "x-a", value: "2" },
        ],
      }),
    ).toBe(422);
    expect(await refused({ target: "everyone" })).toBe(422);
  });

  test("a name that collides with another is a conflict", async () => {
    await call("POST", "/mcp-servers", alice.token, { ...valid, name: "Docs Site" });
    const again = await call("POST", "/mcp-servers", alice.token, { ...valid, name: "docs-site" });
    expect(again.status).toBe(409);
  });
});
