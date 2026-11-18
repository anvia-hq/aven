import { afterAll, describe, expect, test } from "bun:test";

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("memory store (postgres)", async () => {
  const { memoryStore: store } = await import("./memory-store");
  const suffix = crypto.randomUUID();
  const scope = (organizationId: string) => ({
    sessionId: `test-thread-${suffix}`,
    metadata: { organizationId },
  });

  afterAll(async () => {
    await store.clear({ scope: scope("org-a") });
    await store.clear({ scope: scope("org-b") });
  });

  test("the migrated tables pass validation", async () => {
    await store.validate();
  });

  test("appended messages load back in order", async () => {
    await store.append({
      scope: scope("org-a"),
      runId: "run-1",
      turn: 1,
      messages: [
        { role: "user", content: "remember 42" },
        { role: "assistant", content: "ok" },
      ],
    });
    await store.append({
      scope: scope("org-a"),
      runId: "run-2",
      turn: 1,
      messages: [{ role: "user", content: "what number?" }],
    });
    const loaded = await store.load({ scope: scope("org-a") });
    expect(loaded.map((message) => message.content)).toEqual(["remember 42", "ok", "what number?"]);
  });

  test("a NUL character in a message is dropped instead of failing the whole append", async () => {
    await store.append({
      scope: scope("org-a"),
      runId: "run-nul",
      turn: 1,
      messages: [
        { role: "user", content: "cat the font" },
        {
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolCallId: "call-1",
              toolName: "exec_command",
              output: {
                type: "json",
                value: { stdout: "wOFF\u0000\u0001\\u0000 kept", "a\u0000b": 1 },
              },
            },
          ],
        },
      ],
    });
    const loaded = await store.load({ scope: scope("org-a") });
    const tool = loaded.at(-1);
    expect(JSON.stringify(tool)).toContain("wOFF\\u0001\\\\u0000 kept");
    expect(JSON.stringify(tool)).toContain('"ab":1');
  });

  test("the same session id in another organization sees nothing", async () => {
    expect(await store.load({ scope: scope("org-b") })).toEqual([]);
  });
});
