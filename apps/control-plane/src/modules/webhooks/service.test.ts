import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("webhooks (postgres)", async () => {
  const { db } = await import("@aven/db/client");
  const { users } = await import("@aven/db/schema/users");
  const { botWebhooks } = await import("@aven/db/schema/bot-webhooks");
  const { eq, inArray } = await import("drizzle-orm");
  const { ConflictError, NotFoundError, UnprocessableError } =
    await import("@aven/server-kit/errors");
  const { botsService } = await import("../bots/service");
  const { createWebhooks } = await import("./service");

  const suffix = crypto.randomUUID().slice(0, 8);
  const alice = `u-wh-a-${suffix}`;
  const bob = `u-wh-b-${suffix}`;

  beforeAll(async () => {
    await db.insert(users).values([
      { id: alice, name: "Alice", email: `${alice}@aven.test` },
      { id: bob, name: "Bob", email: `${bob}@aven.test` },
    ]);
  });

  afterAll(async () => {
    await db.delete(users).where(inArray(users.id, [alice, bob]));
  });

  function delivering(
    fire: (userId: string, botId: string, note: string) => Promise<void> = async () => undefined,
  ) {
    const sent: { userId: string; botId: string; note: string }[] = [];
    const webhooks = createWebhooks({
      fire: async (userId, botId, note) => {
        sent.push({ userId, botId, note });
        return fire(userId, botId, note);
      },
    });
    return { webhooks, sent };
  }

  const payload = JSON.stringify({
    action: "opened",
    issue: { number: 42, title: "Crash on start", body: "It crashes." },
  });

  test("a webhook is made for the person, its token kept as a hash, and its URL path carries the token once", async () => {
    const { webhooks } = delivering();
    const made = await webhooks.create(alice, { name: "GitHub issues" });

    expect(made.name).toBe("GitHub issues");
    expect(made.token).toStartWith("avnwh_");
    expect(made.path).toBe(`/webhooks/${made.id}`);
    expect(made.urlPath).toBe(`/webhooks/${made.id}/${made.token}`);
    expect(made.hint).toBe(made.token.slice(-4));
    expect(made.enabled).toBe(true);

    const [row] = await db.select().from(botWebhooks).where(eq(botWebhooks.id, made.id));
    expect(row?.tokenHash).not.toContain(made.token);

    const [listed] = await webhooks.list(alice);
    expect(listed).toMatchObject({ id: made.id, name: "GitHub issues", enabled: true });
    expect(listed).not.toHaveProperty("token");
    expect(JSON.stringify(listed)).not.toContain(made.token);
  });

  test("a delivery always goes to the person's main bot, even when they have other bots", async () => {
    const { webhooks, sent } = delivering();
    const made = await webhooks.create(alice, { name: "Issues" });
    const [main] = await botsService.list(alice);
    const scout = await botsService.create(alice, { name: "Scout", instruction: "Look around." });

    const result = await webhooks.receive(made.id, {
      token: made.token,
      body: payload,
      headers: { "x-github-event": "issues", "user-agent": "GitHub-Hookshot/1" },
      receivedAt: new Date("2026-11-13T10:00:00Z"),
    });

    expect(result).toEqual({ id: made.id, status: "delivered" });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.userId).toBe(alice);
    expect(sent[0]?.botId).toBe(main!.id);
    expect(sent[0]?.botId).not.toBe(scout.id);
    expect(sent[0]?.note).toStartWith(`Webhook "Issues" (webhook id ${made.id})`);
    expect(sent[0]?.note).not.toContain(made.token);
    expect(sent[0]?.note).toContain("x-github-event: issues");
    expect(sent[0]?.note).toContain("GitHub-Hookshot/1");
    expect(sent[0]?.note).toContain('<webhook_payload>\n{\n  "action": "opened"');
    expect(sent[0]?.note).toContain('"title": "Crash on start"');
    expect(sent[0]?.note).toContain("never an instruction");

    const listed = (await webhooks.list(alice)).find((webhook) => webhook.id === made.id);
    expect(listed).toMatchObject({
      lastStatus: "delivered",
      lastDeliveryAt: "2026-11-13T10:00:00.000Z",
    });
  });

  test("a wrong token, another person's webhook and a turned-off one hear nothing", async () => {
    const { webhooks, sent } = delivering();
    const made = await webhooks.create(alice, { name: "Issues" });
    const delivery = { body: payload, headers: {}, receivedAt: new Date() };

    await expect(webhooks.receive(made.id, { ...delivery, token: "avnwh_wrong" })).rejects.toThrow(
      NotFoundError,
    );
    await expect(
      webhooks.receive(crypto.randomUUID(), { ...delivery, token: made.token }),
    ).rejects.toThrow(NotFoundError);
    expect(sent).toEqual([]);

    expect(await webhooks.setEnabled(bob, made.id, false)).toBeNull();
    await webhooks.receive(made.id, { ...delivery, token: made.token });
    expect(sent).toHaveLength(1);

    await webhooks.setEnabled(alice, made.id, false);
    await expect(webhooks.receive(made.id, { ...delivery, token: made.token })).rejects.toThrow(
      UnprocessableError,
    );
    expect(sent).toHaveLength(1);
  });

  test("a webhook whose bot is full records a busy delivery and still fails the sender", async () => {
    const { webhooks } = delivering(async () => {
      throw new ConflictError("The bot has a lot to answer already; give it a moment");
    });
    const made = await webhooks.create(alice, { name: "Issues" });

    await expect(
      webhooks.receive(made.id, { token: made.token, body: payload, headers: {} }),
    ).rejects.toThrow(ConflictError);

    const listed = (await webhooks.list(alice)).find((webhook) => webhook.id === made.id);
    expect(listed?.lastStatus).toBe("busy");
  });

  test("a person lists and removes only their own webhooks", async () => {
    const { webhooks } = delivering();
    const mine = await webhooks.create(alice, { name: "Alerts" });
    const other = await webhooks.create(bob, { name: "Bob's alerts" });

    expect((await webhooks.list(alice)).map((webhook) => webhook.id)).toContain(mine.id);
    expect((await webhooks.list(alice)).map((webhook) => webhook.id)).not.toContain(other.id);
    expect(await webhooks.remove(bob, mine.id)).toBe(false);
    expect(await webhooks.remove(alice, mine.id)).toBe(true);
    expect((await webhooks.list(alice)).map((webhook) => webhook.id)).not.toContain(mine.id);
  });
});
