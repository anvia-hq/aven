import { afterAll, describe, expect, test } from "bun:test";

import { db } from "@aven/db/client";
import { mcpServers } from "@aven/db/schema/mcp-servers";
import { users } from "@aven/db/schema/users";
import { eq } from "drizzle-orm";

import { UnprocessableError } from "@aven/server-kit/errors";
import { botMcp } from "./bot-access";
import { mcpService } from "./service";

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("a bot's use of the person's MCP servers (postgres)", async () => {
  const suffix = crypto.randomUUID().slice(0, 8);
  const alice = `bot-mcp-a-${suffix}`;
  const bob = `bot-mcp-b-${suffix}`;
  await db.insert(users).values([
    { id: alice, name: "Alice", email: `${alice}@aven.test` },
    { id: bob, name: "Bob", email: `${bob}@aven.test` },
  ]);
  afterAll(async () => {
    await db.delete(users).where(eq(users.id, alice));
    await db.delete(users).where(eq(users.id, bob));
  });

  test("adds a server, which is never one on the runner's own network, and shows no secret", async () => {
    const added = await botMcp.add(alice, {
      name: "Notes",
      url: "http://localhost:9000/mcp",
      headers: [{ name: "Authorization", value: "Bearer s3cret-token" }],
    });
    expect(added).toMatchObject({
      name: "Notes",
      target: "all",
      enabled: true,
      headerNames: ["Authorization"],
    });
    expect(JSON.stringify(added)).not.toContain("s3cret");
    expect(added).not.toHaveProperty("allowLocal");
    const [given] = (await mcpService.forRun(alice, "bots")).filter((s) => s.id === added.id);
    expect(given?.allowLocal).toBe(false);
    expect(JSON.stringify(await botMcp.list(alice))).not.toContain("s3cret");
  });

  test("moving a server drops its saved headers, so a secret never goes to a new address", async () => {
    const server = await botMcp.add(alice, {
      name: "Moves",
      url: "https://good.example.com/mcp",
      headers: [{ name: "Authorization", value: "Bearer keep-away" }],
    });
    const moved = await botMcp.update(alice, server.id, { url: "https://evil.example.com/mcp" });
    expect(moved.headerNames).toEqual([]);
    const [now] = (await mcpService.forRun(alice, "bots")).filter((s) => s.id === server.id);
    expect(now?.headers).toEqual({});
    expect(JSON.stringify(now)).not.toContain("keep-away");
  });

  test("a bot moving a server the person allowed on this machine cannot keep that allowance", async () => {
    const local = await mcpService.create(alice, {
      name: "Own Machine",
      url: "http://127.0.0.1:9000/mcp",
      headers: [],
      target: "all",
      enabled: true,
      allowLocal: true,
    });
    await botMcp.update(alice, local.id, { url: "http://169.254.169.254/latest/meta-data/" });
    const [row] = await db.select().from(mcpServers).where(eq(mcpServers.id, local.id));
    expect(row?.url).toBe("http://169.254.169.254/latest/meta-data/");
    expect(row?.allowLocal).toBe(false);
  });

  test("a change that leaves the address keeps the headers, and new ones replace them", async () => {
    const server = await botMcp.add(alice, {
      name: "Stays",
      url: "https://good.example.com/mcp",
      headers: [{ name: "Authorization", value: "Bearer first" }],
    });
    const renamed = await botMcp.update(alice, server.id, { enabled: false, target: "threads" });
    expect(renamed).toMatchObject({
      enabled: false,
      target: "threads",
      headerNames: ["Authorization"],
    });
    const same = await botMcp.update(alice, server.id, { url: "https://good.example.com/mcp" });
    expect(same.headerNames).toEqual(["Authorization"]);

    const replaced = await botMcp.update(alice, server.id, {
      url: "https://other.example.com/mcp",
      headers: [{ name: "X-Key", value: "second" }],
    });
    expect(replaced.headerNames).toEqual(["X-Key"]);
  });

  test("a bot's server is checked the way the API checks one: no credentials in the address, no reserved header", async () => {
    const before = (await botMcp.list(alice)).length;
    await expect(
      botMcp.add(alice, { name: "Creds", url: "https://user:pass@example.com/mcp" }),
    ).rejects.toThrow("no user name or password");
    await expect(
      botMcp.add(alice, {
        name: "Reserved",
        url: "https://good.example.com/mcp",
        headers: [{ name: "Host", value: "evil.example.com" }],
      }),
    ).rejects.toThrow("sets that header");
    await expect(
      botMcp.add(alice, {
        name: "Newline",
        url: "https://good.example.com/mcp",
        headers: [{ name: "Authorization", value: "Bearer a\nX-Injected: 1" }],
      }),
    ).rejects.toThrow("one line");
    await expect(
      botMcp.add(alice, { name: "Bad\u0000Name", url: "https://good.example.com/mcp" }),
    ).rejects.toBeInstanceOf(UnprocessableError);
    expect((await botMcp.list(alice)).length).toBe(before);

    const server = await botMcp.add(alice, {
      name: "Checked",
      url: "https://good.example.com/mcp",
    });
    await expect(
      botMcp.update(alice, server.id, { url: "ftp://files.example.com/mcp" }),
    ).rejects.toThrow("http or https");
    await expect(
      botMcp.update(alice, server.id, {
        url: "https://good.example.com/mcp",
        headers: [{ name: "mcp-session-id", value: "x" }],
      }),
    ).rejects.toThrow("sets that header");
    expect((await botMcp.list(alice)).find((s) => s.id === server.id)?.url).toBe(
      "https://good.example.com/mcp",
    );
    await botMcp.remove(alice, server.id);
  });

  test("another person's servers are not found, changed or removed", async () => {
    const server = await botMcp.add(alice, { name: "Hers", url: "https://good.example.com/mcp" });
    expect(await botMcp.list(bob)).not.toContainEqual(expect.objectContaining({ id: server.id }));
    await expect(botMcp.update(bob, server.id, { enabled: false })).rejects.toBeInstanceOf(
      UnprocessableError,
    );
    await expect(botMcp.remove(bob, server.id)).rejects.toBeInstanceOf(UnprocessableError);
    await botMcp.remove(alice, server.id);
    await expect(botMcp.remove(alice, server.id)).rejects.toBeInstanceOf(UnprocessableError);
  });

  test("a bot uses the servers for bots, and not those for threads or switched off", async () => {
    const person = `bot-mcp-c-${suffix}`;
    await db.insert(users).values({ id: person, name: "C", email: `${person}@aven.test` });
    try {
      await botMcp.add(person, { name: "For all", url: "https://a.example.com/mcp" });
      await botMcp.add(person, { name: "Bots", url: "https://b.example.com/mcp", target: "bots" });
      await botMcp.add(person, {
        name: "Threads",
        url: "https://c.example.com/mcp",
        target: "threads",
      });
      const off = await botMcp.add(person, { name: "Off", url: "https://d.example.com/mcp" });
      await botMcp.update(person, off.id, { enabled: false });
      expect((await botMcp.forRun(person)).map((server) => server.name)).toEqual([
        "Bots",
        "For all",
      ]);
    } finally {
      await db.delete(users).where(eq(users.id, person));
    }
  });
});
