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

/** What the thread says once the conversation has been summarized, and when there was too little to. */
export const COMPACTED = "Compacted the conversation: the earlier turns are now a summary.";
export const NOTHING_TO_COMPACT = "There is nothing to compact yet.";

/** The prompt a compaction run is given: what the person typed, as it shows in the thread. */
export const COMPACT_PROMPT = "/compact";

const MODEL_ID = "compaction";

// Compaction happens as a durable run starts, before its first model call, so a run is the way to
// ask for it. This agent is that run: its own model only answers, from the request it is sent,
// without a provider. The tokens it reports are the ones the summary cost (`spent`, which the
// compactor fills in), so the thread's usage counts what was billed, and the size of the request
// is its context: the new size of the thread's history, which a reload reads back from the message.
// The summary itself is written by the person's own model.
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

/**
 * The agent of a run that only compacts a thread's history (decision 0097). It registers a trigger
 * of one token and keeps no recent turn, so everything before the prompt is summarized, whatever
 * the model's window: for the person who asked, "compact now" is not "compact at 70%".
 */
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
