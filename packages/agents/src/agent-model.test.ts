import { describe, expect, test } from "bun:test";

import { isStreamingCompletionModel } from "@anvia/core/completion";

import { compactionFor, outputLimitFor, resolveAgentModel } from "./agent-model";
import { scriptedModel } from "./testing/scripted-model";

const model = scriptedModel([]);

describe("resolveAgentModel", () => {
  test("a ready model comes as it is, with no provider settings", () => {
    const resolved = resolveAgentModel({ model });
    expect(resolved.model).toBe(model);
    expect(resolved.providerOptions).toBeUndefined();
    expect(resolved.controls).toBeUndefined();
    expect(resolved.retries).toEqual({ maxAttempts: 5 });
  });

  test("a provider's config brings its options and the reasoning effort chosen", () => {
    const anthropic = resolveAgentModel({ provider: "anthropic", apiKey: "k" });
    expect(anthropic.providerOptions).toEqual({ cache_control: { type: "ephemeral" } });
    expect(anthropic.controls).toBeUndefined();

    const openai = resolveAgentModel({ provider: "openai", apiKey: "k", reasoningEffort: "high" });
    expect(openai.providerOptions).toBeUndefined();
    expect(openai.controls).toEqual({ reasoningEffort: "high" });
  });
});

describe("the output limit", () => {
  // Asks the Anthropic adapter for a reply through a local server that refuses it, and returns the
  // body it was sent.
  async function sentTo(
    call: (model: ReturnType<typeof resolveAgentModel>["model"]) => Promise<unknown>,
  ) {
    const bodies: Record<string, unknown>[] = [];
    const server = Bun.serve({
      port: 0,
      async fetch(request) {
        bodies.push((await request.json()) as Record<string, unknown>);
        return Response.json({ error: { type: "error", message: "stop here" } }, { status: 400 });
      },
    });
    try {
      const { model } = resolveAgentModel({
        provider: "anthropic",
        apiKey: "k",
        modelId: "claude-haiku-5-5",
        baseUrl: `http://localhost:${server.port}/v1`,
      });
      await call(model).catch(() => undefined);
    } finally {
      await server.stop(true);
    }
    return bodies[0];
  }

  test("a streamed reply from an Anthropic model is allowed 16,000 tokens", async () => {
    const { maxTokens } = resolveAgentModel({ provider: "anthropic", apiKey: "k" });
    expect(maxTokens).toBe(16_000);
    const body = await sentTo(async (model) => {
      if (!isStreamingCompletionModel(model)) throw new Error("Anthropic models stream");
      for await (const _ of model.streamCompletion({
        chatHistory: [{ role: "user", content: "hello" }],
        documents: [],
        tools: [],
        maxTokens,
      })) {
        // the stream is refused before any event
      }
    });
    expect(body?.max_tokens).toBe(16_000);
    expect(body?.stream).toBe(true);
  });

  test("a reply that is not streamed, as a bot's or a summary is, is allowed the same", async () => {
    const maxTokens = outputLimitFor({ provider: "anthropic", apiKey: "k" });
    const body = await sentTo((model) =>
      model.completion({
        chatHistory: [{ role: "user", content: "hello" }],
        documents: [],
        tools: [],
        maxTokens,
      }),
    );
    expect(body?.max_tokens).toBe(16_000);
    expect(body).not.toHaveProperty("stream");
  });

  test("other providers keep their own default", () => {
    expect(resolveAgentModel({ provider: "openai", apiKey: "k" }).maxTokens).toBeUndefined();
    expect(resolveAgentModel({ model }).maxTokens).toBeUndefined();
    expect(outputLimitFor({ provider: "openai", apiKey: "k" })).toBeUndefined();
  });
});

describe("history from another provider, sent to the Responses API", () => {
  // What OpenAI is sent for a chat that began on Claude: its tool call is `toolu_…`, which the
  // Responses API refused with `Invalid 'input[1].id'. Expected an ID that begins with 'fc'`.
  test("a tool call another provider issued is sent with an id the API takes, matched to its result", async () => {
    const bodies: { input: Record<string, unknown>[] }[] = [];
    const server = Bun.serve({
      port: 0,
      async fetch(request) {
        bodies.push((await request.json()) as { input: Record<string, unknown>[] });
        return Response.json({ error: { message: "stop here" } }, { status: 400 });
      },
    });
    try {
      const { model } = resolveAgentModel({
        provider: "openai",
        apiKey: "k",
        modelId: "gpt-5",
        baseUrl: `http://localhost:${server.port}/v1`,
      });
      await model
        .completion({
          chatHistory: [
            { role: "user", content: "hello" },
            {
              role: "assistant",
              content: [
                {
                  type: "tool-call",
                  toolCallId: "toolu_014fPacb",
                  toolName: "send_message",
                  input: { text: "hi" },
                },
              ],
            },
            {
              role: "tool",
              content: [
                {
                  type: "tool-result",
                  toolCallId: "toolu_014fPacb",
                  toolName: "send_message",
                  output: { type: "json", value: { sent: true } },
                },
              ],
            },
            { role: "user", content: "what tools do you have?" },
          ],
          documents: [],
          tools: [],
        })
        .catch(() => undefined);
    } finally {
      await server.stop(true);
    }

    const items = bodies[0]!.input;
    const sentCall = items.find((item) => item.type === "function_call")!;
    const sentResult = items.find((item) => item.type === "function_call_output")!;
    expect(String(sentCall.id)).toMatch(/^fc/);
    expect(sentCall.call_id).toBe("toolu_014fPacb");
    expect(sentResult.call_id).toBe(sentCall.call_id);
  });
});

describe("compactionFor", () => {
  test("summarizes at 70% of the model's context window", () => {
    const source = { provider: "openai", apiKey: "k", contextWindow: 100_000 } as const;
    expect(compactionFor(source, model)?.trigger).toEqual({ afterTokens: 70_000 });
  });

  test("a size the host gave wins over the window, and works without one", () => {
    const windowed = { provider: "openai", apiKey: "k", contextWindow: 100_000 } as const;
    expect(compactionFor(windowed, model, 5_000)?.trigger).toEqual({ afterTokens: 5_000 });
    expect(compactionFor({ model }, model, 5_000)?.trigger).toEqual({ afterTokens: 5_000 });
  });

  // Reasoning models refuse temperature; Anvia 1.17.3 omits it by default (bug 0004).
  test("the summary request carries no temperature, which reasoning models refuse", async () => {
    const bodies: Record<string, unknown>[] = [];
    const server = Bun.serve({
      port: 0,
      async fetch(request) {
        bodies.push((await request.json()) as Record<string, unknown>);
        return Response.json({ error: { message: "stop here" } }, { status: 400 });
      },
    });
    try {
      const source = {
        provider: "openai",
        apiKey: "k",
        modelId: "gpt-5",
        baseUrl: `http://localhost:${server.port}/v1`,
        contextWindow: 100_000,
      } as const;
      const { model: provider } = resolveAgentModel(source);
      const messages = [{ role: "user", content: "hello" }] as never;
      await compactionFor(source, provider)!
        .compactor({ messages, abortSignal: undefined } as never)
        .catch(() => undefined);
    } finally {
      await server.stop(true);
    }

    expect(bodies[0]).toBeDefined();
    expect(bodies[0]).not.toHaveProperty("temperature");
  });

  test("with neither there is nothing to measure against, so history is left whole", () => {
    expect(compactionFor({ provider: "openai", apiKey: "k" }, model)).toBeUndefined();
    expect(compactionFor({ model }, model)).toBeUndefined();
  });
});
