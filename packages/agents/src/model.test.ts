import { afterAll, describe, expect, test } from "bun:test";
import { Agent } from "@anvia/core";
import { AnthropicClient } from "@anvia/anthropic";

import { providerOptionsFor } from "./model";

describe("providerOptionsFor", () => {
  test("only anthropic gets automatic prompt caching", () => {
    expect(providerOptionsFor("anthropic")).toEqual({ cache_control: { type: "ephemeral" } });
    expect(providerOptionsFor("openai")).toBeUndefined();
    expect(providerOptionsFor("openai-compatible")).toBeUndefined();
  });
});

describe("anthropic request", () => {
  const bodies: Record<string, unknown>[] = [];
  const server = Bun.serve({
    port: 0,
    async fetch(req) {
      bodies.push((await req.json()) as Record<string, unknown>);
      // Only the request matters; a 400 is not retried by the SDK.
      return Response.json(
        { type: "error", error: { type: "invalid_request_error", message: "stop" } },
        { status: 400 },
      );
    },
  });
  afterAll(() => server.stop(true));

  test("the SDK sends a top-level cache_control", async () => {
    const model = new AnthropicClient({
      apiKey: "k",
      baseUrl: `http://localhost:${server.port}`,
    }).completionModel({ modelId: "claude-sonnet-5" });
    const agent = new Agent({
      id: "t",
      model,
      instructions: "be brief",
      providerOptions: providerOptionsFor("anthropic"),
    });
    await agent.generate({ prompt: "hello" }).catch(() => undefined);
    expect(bodies[0]?.cache_control).toEqual({ type: "ephemeral" });
  });
});
