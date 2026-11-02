import { afterAll, describe, expect, test } from "bun:test";

import { db } from "@aven/db/client";
import { mcpServers } from "@aven/db/schema/mcp-servers";
import { users } from "@aven/db/schema/users";
import { MCP_LIMIT } from "@aven/protocol/mcp";
import { eq } from "drizzle-orm";

import { ConflictError, UnprocessableError } from "../../errors";
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

  test("two names that read the same in a tool's name are one server", async () => {
    await mcpService.create(alice, make({ name: "Team Notes" }));
    await expect(mcpService.create(alice, make({ name: "team-notes" }))).rejects.toBeInstanceOf(
      ConflictError,
    );
    // Another person may use the same name.
    await mcpService.create(bob, make({ name: "Team Notes" }));
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

  test("another person's server is not found, changed or removed", async () => {
    const server = await mcpService.create(alice, make({ name: "Private" }));
    expect(await mcpService.get(bob, server.id)).toBeNull();
    expect(await mcpService.update(bob, server.id, change({ enabled: false }))).toBeNull();
    expect(await mcpService.remove(bob, server.id)).toBe(false);
    expect((await mcpService.list(bob)).map((s) => s.id)).not.toContain(server.id);
    expect((await mcpService.get(alice, server.id))?.enabled).toBe(true);
    expect(await mcpService.remove(alice, server.id)).toBe(true);
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
      // Nobody else's servers are in it.
      expect(await mcpService.forRun(bob, "threads")).not.toContainEqual(
        expect.objectContaining({ name: "Threads only" }),
      );
    } finally {
      await db.delete(users).where(eq(users.id, person));
    }
  });
});
