import { afterAll, describe, expect, test } from "bun:test";

import { db } from "@aven/db/client";
import { mcpServers } from "@aven/db/schema/mcp-servers";
import { users } from "@aven/db/schema/users";
import { MCP_LIMIT } from "@aven/protocol/mcp";
import { eq } from "drizzle-orm";

import { UnprocessableError } from "@aven/server-kit/errors";
import { createMcpBody, updateMcpBody } from "./schema";
import { mcpService } from "./service";

const run = process.env.DATABASE_URL ? describe : describe.skip;

const make = (body: Record<string, unknown>) =>
  createMcpBody.parse({ url: "https://mcp.example.com/api", ...body });
const change = (body: Record<string, unknown>) => updateMcpBody.parse(body);

run("mcpService (postgres)", async () => {
  const suffix = crypto.randomUUID().slice(0, 8);
  const alice = `mcp-a-${suffix}`;
  const bob = `mcp-b-${suffix}`;
  await db.insert(users).values([
    { id: alice, name: "Alice", email: `${alice}@aven.test` },
    { id: bob, name: "Bob", email: `${bob}@aven.test` },
  ]);
  afterAll(async () => {
    await db.delete(users).where(eq(users.id, alice));
    await db.delete(users).where(eq(users.id, bob));
  });

  test("keeps the headers encrypted and shows their names only", async () => {
    const server = await mcpService.create(
      alice,
      make({ name: "Notes", headers: [{ name: "Authorization", value: "Bearer s3cret-token" }] }),
    );
    expect(server).toMatchObject({ name: "Notes", slug: "notes", headerNames: ["Authorization"] });
    expect(JSON.stringify(server)).not.toContain("s3cret");
    expect(JSON.stringify(await mcpService.list(alice))).not.toContain("s3cret");

    const [row] = await db.select().from(mcpServers).where(eq(mcpServers.id, server.id));
    expect(row?.headers).not.toContain("s3cret");
    expect(row?.headers).not.toContain("Authorization");
  });

  test("a person has a limited number of servers", async () => {
    const person = `mcp-c-${suffix}`;
    await db.insert(users).values({ id: person, name: "C", email: `${person}@aven.test` });
    try {
      for (let index = 0; index < MCP_LIMIT; index++) {
        await mcpService.create(person, make({ name: `Server ${index}` }));
      }
      await expect(mcpService.create(person, make({ name: "One more" }))).rejects.toBeInstanceOf(
        UnprocessableError,
      );
    } finally {
      await db.delete(users).where(eq(users.id, person));
    }
  });

  test("a header sent without a value keeps its value, and one not sent is removed", async () => {
    const server = await mcpService.create(
      alice,
      make({
        name: "Headers",
        headers: [
          { name: "Authorization", value: "Bearer keep-me" },
          { name: "X-Team", value: "red" },
        ],
      }),
    );
    const updated = await mcpService.update(
      alice,
      server.id,
      change({
        headers: [
          { name: "Authorization", value: null },
          { name: "X-Extra", value: "new" },
        ],
      }),
    );
    expect(updated?.headerNames).toEqual(["Authorization", "X-Extra"]);

    const [run] = (await mcpService.forRun(alice, "threads")).filter((s) => s.id === server.id);
    expect(run?.headers).toEqual({ Authorization: "Bearer keep-me", "X-Extra": "new" });

    await expect(
      mcpService.update(alice, server.id, change({ headers: [{ name: "X-Gone", value: null }] })),
    ).rejects.toBeInstanceOf(UnprocessableError);
  });

  test("a new address or headers clear the error the old ones had", async () => {
    const server = await mcpService.create(alice, make({ name: "Errors" }));
    await db
      .update(mcpServers)
      .set({ lastError: "connection refused" })
      .where(eq(mcpServers.id, server.id));

    const renamed = await mcpService.update(alice, server.id, change({ name: "Errors Renamed" }));
    expect(renamed?.lastError).toBe("connection refused");
    const moved = await mcpService.update(
      alice,
      server.id,
      change({ url: "https://other.example.com/mcp" }),
    );
    expect(moved?.lastError).toBeNull();
  });

  test("moving a server to another address clears its allowance for this machine, unless the change allows it", async () => {
    const local = await mcpService.create(
      alice,
      make({ name: "Local Allowed", url: "http://127.0.0.1:9000/mcp", allowLocal: true }),
    );
    expect(local.allowLocal).toBe(true);
    const moved = await mcpService.update(
      alice,
      local.id,
      change({ url: "http://169.254.169.254/latest/meta-data/" }),
    );
    expect(moved?.allowLocal).toBe(false);
    const again = await mcpService.update(
      alice,
      local.id,
      change({ url: "http://127.0.0.1:9001/mcp", allowLocal: true }),
    );
    expect(again?.allowLocal).toBe(true);
    const sameAddress = await mcpService.update(alice, local.id, change({ name: "Local Renamed" }));
    expect(sameAddress?.allowLocal).toBe(true);
  });

  test("how a run's servers connected is kept: the reason one did not, and when one did", async () => {
    const person = `mcp-e-${suffix}`;
    await db.insert(users).values({ id: person, name: "E", email: `${person}@aven.test` });
    try {
      const down = await mcpService.create(person, make({ name: "Down" }));
      const up = await mcpService.create(person, make({ name: "Up" }));
      await mcpService.record([{ id: down.id, error: "connection refused" }, { id: up.id }]);
      expect(await mcpService.get(person, down.id)).toMatchObject({
        lastError: "connection refused",
        lastUsedAt: null,
      });
      const connected = await mcpService.get(person, up.id);
      expect(connected?.lastError).toBeNull();
      expect(connected?.lastUsedAt).not.toBeNull();

      await mcpService.record([{ id: down.id }]);
      expect((await mcpService.get(person, down.id))?.lastError).toBeNull();
    } finally {
      await db.delete(users).where(eq(users.id, person));
    }
  });

  test("a run gets the enabled servers for its kind of agent, with their headers", async () => {
    const person = `mcp-d-${suffix}`;
    await db.insert(users).values({ id: person, name: "D", email: `${person}@aven.test` });
    try {
      const header = [{ name: "Authorization", value: "Bearer abc" }];
      await mcpService.create(person, make({ name: "Everyone", headers: header }));
      await mcpService.create(person, make({ name: "Bots only", target: "bots" }));
      await mcpService.create(person, make({ name: "Threads only", target: "threads" }));
      await mcpService.create(person, make({ name: "Off", enabled: false }));

      const names = async (agent: "bots" | "threads") =>
        (await mcpService.forRun(person, agent)).map((server) => server.name);
      expect(await names("bots")).toEqual(["Bots only", "Everyone"]);
      expect(await names("threads")).toEqual(["Everyone", "Threads only"]);
      const [everyone] = (await mcpService.forRun(person, "bots")).filter(
        (server) => server.name === "Everyone",
      );
      expect(everyone).toMatchObject({
        url: "https://mcp.example.com/api",
        headers: { Authorization: "Bearer abc" },
        allowLocal: false,
      });
      expect(await mcpService.forRun(bob, "threads")).not.toContainEqual(
        expect.objectContaining({ name: "Threads only" }),
      );
    } finally {
      await db.delete(users).where(eq(users.id, person));
    }
  });
});
