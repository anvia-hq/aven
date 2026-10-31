import { afterAll, describe, expect, test } from "bun:test";

import { db } from "@aven/db/client";
import { startRuntime } from "@aven/runtime-client/runner";
import { directoryWorkspaces } from "@aven/runtime-client/testing/directory-workspaces";
import { journalPath } from "@aven/runtime-client/testing/journal-path";
import { Elysia } from "elysia";

import { createMemoryStore } from "../../memory-store";
import { memoryContinuations } from "../../testing/memory-continuations";
import { seedOrgPair } from "../../testing/seed-org-pair";
import { connectRouter } from "../runtimes/connect";
import { RunGateway } from "../runtimes/gateway";
import { RuntimeHub } from "../runtimes/hub";
import { runtimesService } from "../runtimes/service";
import { RemoteRuntime } from "./remote-runtime";
import { RunManager } from "./service";

const run = process.env.DATABASE_URL ? describe : describe.skip;

const sse = (events: [string, unknown][]) =>
  events.map(([name, data]) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`).join("");

// A minimal Anthropic streaming answer: one text block.
const answer = (text: string) =>
  sse([
    [
      "message_start",
      {
        type: "message_start",
        message: {
          id: "msg_1",
          type: "message",
          role: "assistant",
          model: "claude-sonnet-5",
          content: [],
          stop_reason: null,
          usage: { input_tokens: 10, output_tokens: 1 },
        },
      },
    ],
    [
      "content_block_start",
      { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    ],
    [
      "content_block_delta",
      { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } },
    ],
    ["content_block_stop", { type: "content_block_stop", index: 0 }],
    [
      "message_delta",
      {
        type: "message_delta",
        delta: { stop_reason: "end_turn", stop_sequence: null },
        usage: { output_tokens: 5 },
      },
    ],
    ["message_stop", { type: "message_stop" }],
  ]);

// The whole remote path with nothing scripted: a runtime built from its own defaults reaches the
// model only through the control plane's gateway, and the conversation lives in the control plane.
run("a run on a remote runtime, end to end (real postgres, fake provider)", async () => {
  const seed = await seedOrgPair();
  const store = createMemoryStore(db);
  const hub = new RuntimeHub(store);
  const threadId = crypto.randomUUID();
  const requests: { headers: Headers; body: Record<string, unknown> }[] = [];

  const provider = Bun.serve({
    port: 0,
    async fetch(req) {
      requests.push({ headers: req.headers, body: (await req.json()) as Record<string, unknown> });
      return new Response(answer(`reply ${requests.length}`), {
        headers: { "content-type": "text/event-stream" },
      });
    },
  });
  // The gateway forwards to the vendor; here the vendor is the fake.
  const pointed = new RunGateway({
    anthropic: `http://localhost:${provider.port}`,
    openai: `http://localhost:${provider.port}/v1`,
  });

  const controlPlane = new Elysia()
    .use(connectRouter(hub))
    .all(
      "/runtimes/gateway/:segment/*",
      ({ request, params }) => pointed.forward(request, params.segment, params["*"]),
      { parse: "none" },
    )
    .listen({ port: 0 });

  const { runtime, token } = await runtimesService.create(seed.orgA, seed.userId, { name: "e2e" });
  const workspaces = directoryWorkspaces();
  const client = startRuntime({
    url: `ws://localhost:${controlPlane.server?.port}/connect`,
    token,
    sandbox: workspaces,
    journalPath: journalPath(),
  });

  afterAll(async () => {
    await client.stop();
    hub.closeAll();
    await controlPlane.stop(true);
    provider.stop(true);
    await store.clear({
      scope: { sessionId: threadId, metadata: { organizationId: seed.orgA } },
    });
    await seed.cleanup();
  });

  const manager = new RunManager({
    store,
    runtime: new RemoteRuntime(hub, pointed),
    onRunFinished: () => undefined,
    continuations: memoryContinuations().store,
  });
  const thread = {
    id: threadId,
    organizationId: seed.orgA,
    runtimeId: runtime.id,
  };
  const model = {
    provider: "anthropic",
    modelId: "claude-sonnet-5",
    apiKey: "sk-the-real-key",
  } as const;

  const until = async (check: () => boolean | Promise<boolean>) => {
    const deadline = Date.now() + 8000;
    while (!(await check())) {
      if (Date.now() > deadline) throw new Error("timed out");
      await Bun.sleep(25);
    }
  };

  test("the agent answers through the gateway and the conversation is stored by the control plane", async () => {
    await client.ready;
    await until(() => hub.isOnline(runtime.id));

    await manager.start(thread, "first question", model);
    await until(() => !manager.isRunning(thread.id) && requests.length === 1);

    expect(requests[0]!.headers.get("x-api-key")).toBe("sk-the-real-key");
    expect(requests[0]!.body.model).toBe("claude-sonnet-5");
    expect(JSON.stringify(requests[0]!.body)).toContain("first question");

    // The runtime never held the key, and has no memory of its own: the next run's history comes
    // from the control plane.
    await manager.start(thread, "second question", model);
    await until(() => !manager.isRunning(thread.id) && requests.length === 2);
    const second = JSON.stringify(requests[1]!.body);
    expect(second).toContain("first question");
    expect(second).toContain("reply 1");
    expect(second).toContain("second question");

    const history = await manager.history(thread);
    expect(history.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "user",
      "assistant",
    ]);
    expect(JSON.stringify(history)).toContain("reply 2");
  });
});
