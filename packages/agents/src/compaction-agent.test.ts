import { describe, expect, test } from "bun:test";
import { Agent, Usage, type CompletionResponse, type Message, type MemoryStore } from "@anvia/core";
import type { StreamingCompletionModel } from "@anvia/core/completion";

import {
  COMPACTED,
  COMPACTION_MODEL_ID,
  COMPACT_PROMPT,
  NOTHING_TO_COMPACT,
  createCompactionAgent,
} from "./compaction-agent";
import { scriptedModel, text } from "./testing/scripted-model";
import { usageFromHistory } from "./usage";

function compactableStore(initial: Message[]) {
  let messages = [...initial];
  let revision = 0;

  const store: MemoryStore = {
    load: async () => [...messages],
    append: async ({ messages: added }) => {
      messages.push(...added);
      revision += 1;
    },
    clear: async () => {
      messages = [];
      revision += 1;
    },
    compaction: {
      snapshot: async () => ({ revision: String(revision), messages: [...messages] }),
      replacePrefix: async ({ revision: seen, messageCount, replacement }) => {
        if (seen !== String(revision)) return { status: "conflict" };

        messages = [replacement, ...messages.slice(messageCount)];
        revision += 1;
        return { status: "committed" };
      },
    },
  };

  return { store, messages: () => messages };
}

function modelWithUsage(summary: string, usage: Usage): StreamingCompletionModel {
  const response: CompletionResponse = {
    choice: [{ type: "text", text: summary }],
    usage,
    finishReason: "stop",
    rawResponse: null,
  };
  return {
    provider: "scripted",
    modelId: "summary-model",
    capabilities: {
      streaming: true,
      tools: false,
      toolChoice: false,
      imageInput: false,
      documentInput: false,
      outputSchema: false,
      reasoning: false,
    },
    completion: async () => response,
    async *streamCompletion() {
      yield { type: "text_delta", delta: summary };
      yield { type: "final", response };
    },
  };
}

async function runCompaction(
  options: Parameters<typeof createCompactionAgent>[0],
  initial: Message[],
) {
  const { agent, compaction } = createCompactionAgent(options);
  const memory = compactableStore(initial);
  const runner = new Agent({
    id: agent.id,
    instructions: agent.instructions,
    model: agent.model,
    maxTurns: 1,
    memory: { store: memory.store, savePolicy: "turn", compaction },
  });
  const result = await runner.generate({
    prompt: COMPACT_PROMPT,
    session: { sessionId: "s1" },
  });
  return { agent, result, messages: memory.messages() };
}

describe("createCompactionAgent", () => {
  test("summarizes prior turns, reports COMPACTED, and carries the summarizer usage", async () => {
    const spent = { ...Usage.empty(), inputTokens: 120, outputTokens: 45, totalTokens: 165 };
    const { agent, result, messages } = await runCompaction(
      {
        id: "compact-1",
        model: modelWithUsage("Condensed summary of prior work.", spent),
      },
      [
        { role: "user", content: "Refactor the parser" },
        { role: "assistant", content: "Done." },
      ],
    );

    expect(result.type).toBe("response");

    if (result.type === "response") {
      expect(result.text).toBe(COMPACTED);
    }

    const usage = usageFromHistory(messages);
    expect(usage.totals.inputTokens).toBe(120);
    expect(usage.totals.outputTokens).toBe(45);
    expect(agent.model.modelId).toBe(COMPACTION_MODEL_ID);
    expect(JSON.stringify(messages)).toContain("Condensed summary of prior work.");
  });

  test("says nothing to compact when there is no prior history to summarize", async () => {
    const { result } = await runCompaction(
      {
        id: "compact-empty",
        model: scriptedModel([[text("should not run")]]),
      },
      [],
    );

    expect(result.type).toBe("response");

    if (result.type === "response") {
      expect(result.text).toBe(NOTHING_TO_COMPACT);
    }
  });

  test("reports estimated post-compaction context usage when contextWindow is given", async () => {
    const { messages } = await runCompaction(
      {
        id: "compact-window",
        model: scriptedModel([[text("Short summary.")]]),
        contextWindow: 10_000,
      } as Parameters<typeof createCompactionAgent>[0],
      [
        { role: "user", content: "Explain the build" },
        { role: "assistant", content: "It runs bun." },
      ],
    );

    const usage = usageFromHistory(messages);
    expect(usage.context?.contextWindow).toBe(10_000);
    expect(usage.context?.usedTokens).toBeGreaterThan(0);
  });

  test("omits contextUsage without a contextWindow so usageFromHistory ignores the compaction model id", async () => {
    const { messages } = await runCompaction(
      {
        id: "compact-no-window",
        model: modelWithUsage("Short summary.", {
          ...Usage.empty(),
          inputTokens: 90,
          outputTokens: 20,
          totalTokens: 110,
        }),
      },
      [
        { role: "user", content: "Explain the build" },
        { role: "assistant", content: "It runs bun." },
      ],
    );

    const usage = usageFromHistory(messages);
    expect(usage.totals.inputTokens).toBe(90);
    expect(usage.totals.outputTokens).toBe(20);
    expect(usage.context).toBeUndefined();
  });

  test("streams text deltas and a final response from its compaction model", async () => {
    const { agent } = createCompactionAgent({
      id: "compact-stream",
      model: scriptedModel([]),
    });
    const deltas: string[] = [];
    const model = agent.model as StreamingCompletionModel;

    for await (const event of model.streamCompletion({
      chatHistory: [],
      documents: [],
      tools: [],
    })) {
      if (event.type === "text_delta") deltas.push(event.delta);
    }

    expect(deltas.join("")).toBe(NOTHING_TO_COMPACT);
  });
});
