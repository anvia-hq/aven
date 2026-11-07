import {
  Agent,
  Usage,
  calculateContextUsage,
  type CompletionRequest,
  type CompletionResponse,
} from "@anvia/core";
import type { StreamingCompletionModel } from "@anvia/core/completion";
import {
  createSummaryMemoryCompactor,
  estimateMemoryTokens,
  isMemoryCompactionMessage,
} from "@anvia/core/memory";

import { outputLimitFor, resolveAgentModel, type ModelSource } from "./agent-model";

export const COMPACTED = "Compacted the conversation: the earlier turns are now a summary.";
export const NOTHING_TO_COMPACT = "There is nothing to compact yet.";

export const COMPACT_PROMPT = "/compact";

const MODEL_ID = "compaction";

function compactionReply(spent: () => Usage, contextWindow?: number): StreamingCompletionModel {
  const respond = async (request: CompletionRequest): Promise<CompletionResponse> => {
    const summarized = request.chatHistory.some(isMemoryCompactionMessage);
    const size = estimateMemoryTokens(request.chatHistory);
    return {
      choice: [{ type: "text", text: summarized ? COMPACTED : NOTHING_TO_COMPACT }],
      usage: spent(),
      contextUsage: contextWindow
        ? calculateContextUsage(
            { ...Usage.empty(), inputTokens: size, totalTokens: size },
            { modelId: MODEL_ID, context: { contextWindow } },
          )
        : undefined,
      finishReason: "stop",
      rawResponse: null,
    };
  };
  return {
    provider: "aven",
    modelId: MODEL_ID,
    capabilities: {
      streaming: true,
      tools: false,
      toolChoice: false,
      imageInput: false,
      documentInput: false,
      outputSchema: false,
      reasoning: false,
    },
    completion: respond,
    async *streamCompletion(request) {
      const response = await respond(request);
      for (const part of response.choice) {
        if (part.type === "text") yield { type: "text_delta", delta: part.text };
      }
      yield { type: "final", response };
    },
  };
}

export function createCompactionAgent(options: ModelSource & { id: string }) {
  const { model } = resolveAgentModel(options);
  const summarize = createSummaryMemoryCompactor({
    model,
    maxTokens: outputLimitFor(options),
  });
  let spent = Usage.empty();
  const agent = new Agent({
    id: options.id,
    instructions: "Reply with a note on the compaction.",
    model: compactionReply(
      () => spent,
      "contextWindow" in options ? options.contextWindow : undefined,
    ),
    maxTurns: 1,
    tools: [],
  });
  return {
    agent,
    compaction: {
      trigger: { afterTokens: 1 },
      retention: { recentTurns: 0 },
      compactor: async (input: Parameters<typeof summarize>[0]) => {
        const summary = await summarize(input);
        spent = summary.usage ?? spent;
        return summary;
      },
    },
  };
}
