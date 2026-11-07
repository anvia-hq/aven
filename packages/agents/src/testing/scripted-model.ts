import {
  Usage,
  type AssistantContentPart,
  type CompletionRequest,
  type CompletionResponse,
  type JsonValue,
} from "@anvia/core";
import type { StreamingCompletionModel } from "@anvia/core/completion";

export type ScriptStep =
  | AssistantContentPart[]
  | ((request: CompletionRequest) => AssistantContentPart[] | Promise<AssistantContentPart[]>);

export function scriptedModel(steps: ScriptStep[]): StreamingCompletionModel {
  let next = 0;
  const respond = async (request: CompletionRequest): Promise<CompletionResponse> => {
    const step = steps[next++];
    if (!step) throw new Error(`scriptedModel: no step ${next} scripted`);
    const choice = typeof step === "function" ? await step(request) : step;
    const calls = choice.some((part) => part.type === "tool-call");
    return {
      choice,
      usage: Usage.empty(),
      finishReason: calls ? "tool-calls" : "stop",
      rawResponse: null,
    };
  };

  return {
    provider: "scripted",
    modelId: "scripted",
    capabilities: {
      streaming: true,
      tools: true,
      toolChoice: true,
      imageInput: true,
      documentInput: false,
      outputSchema: false,
      reasoning: false,
    },
    completion: respond,
    async *streamCompletion(request) {
      const response = await respond(request);
      for (const part of response.choice) {
        if (part.type === "text") yield { type: "text_delta", delta: part.text };
        if (part.type === "reasoning") yield { type: "reasoning_delta", delta: part.text };
        if (part.type === "tool-call") yield { type: "tool_call", toolCall: part };
      }
      yield { type: "final", response };
    },
  };
}

export const text = (value: string): AssistantContentPart => ({ type: "text", text: value });

export const reasoning = (value: string): AssistantContentPart => ({
  type: "reasoning",
  text: value,
});

export const toolCall = (
  toolName: string,
  input: Record<string, JsonValue>,
  toolCallId = `call_${toolName}_${Math.random().toString(36).slice(2, 8)}`,
): AssistantContentPart => ({ type: "tool-call", toolCallId, toolName, input });
