import { Agent, Usage, type CompletionRequest, type CompletionResponse } from "@anvia/core";
import type { StreamingCompletionModel } from "@anvia/core/completion";
import {
  createSummaryMemoryCompactor,
  estimateMemoryTokens,
  isMemoryCompactionMessage,
} from "@anvia/core/memory";

import { resolveAgentModel, type ModelSource } from "./agent-model";

/** What the thread says once the conversation has been summarized, and when there was too little to. */
export const COMPACTED = "Compacted the conversation: the earlier turns are now a summary.";
export const NOTHING_TO_COMPACT = "There is nothing to compact yet.";

/** The prompt a compaction run is given: what the person typed, as it shows in the thread. */
export const COMPACT_PROMPT = "/compact";

// Compaction happens as a durable run starts, before its first model call, so a run is the way to
// ask for it. This agent is that run: its own model only answers, from the request it is sent,
// without a provider, and it reports the request's size as the tokens it used, which is the new
// size of the thread's context. The summary itself is written by the person's own model.
function compactionReply(): StreamingCompletionModel {
  const respond = async (request: CompletionRequest): Promise<CompletionResponse> => {
    const summarized = request.chatHistory.some(isMemoryCompactionMessage);
    const tokens = estimateMemoryTokens(request.chatHistory);
    return {
      choice: [{ type: "text", text: summarized ? COMPACTED : NOTHING_TO_COMPACT }],
      usage: { ...Usage.empty(), inputTokens: tokens, totalTokens: tokens },
      finishReason: "stop",
      rawResponse: null,
    };
  };
  return {
    provider: "aven",
    modelId: "compaction",
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
  const agent = new Agent({
    id: options.id,
    instructions: "Reply with a note on the compaction.",
    model: compactionReply(),
    maxTurns: 1,
    tools: [],
  });
  return {
    agent,
    compaction: {
      trigger: { afterTokens: 1 },
      retention: { recentTurns: 0 },
      // No temperature: Anvia sends 0 by default, which reasoning models refuse (bug 0004).
      compactor: createSummaryMemoryCompactor({ model, temperature: null }),
    },
  };
}
