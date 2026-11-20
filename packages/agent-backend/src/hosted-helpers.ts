import type { AgentPrompt, Message } from "@anvia/core";
import type { AgentInteractionResponse } from "@anvia/core/agent/interactions";
import type { QuestionPrompt, RunEvent } from "@aven/protocol/types";

import type {
  BackendImage,
  BackendSessionPrefix,
  BackendUserInput,
  DurableEnd,
  Emit,
  FollowedRun,
  Gate,
} from "./types";

export const AVEN_NOTE =
  "You are running inside Aven, on the person's computer, in this thread's folder. Call the aven MCP tools for files, commands, git, processes, artifacts, memory, questions and goals. ask_user and request_secret pause the run until the person answers. Do not use a built-in shell or file tool.";

export const STEER_NOTE =
  "The person sent this while you were working. Read it now and change course if it asks you to:";

export const CONTINUE =
  "The runner restarted while you were working. Continue from the workspace. Do not repeat a step you already finished.";

export function gate(): Gate {
  let resolve: (end: DurableEnd) => void = () => undefined;
  const promise = new Promise<DurableEnd>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

export function linkAbortSignal(
  source: AbortSignal | undefined,
  target: AbortController,
): () => void {
  if (!source) return () => undefined;

  if (source.aborted) {
    target.abort();
    return () => undefined;
  }

  const onAbort = () => target.abort();
  source.addEventListener("abort", onAbort, { once: true });
  return () => source.removeEventListener("abort", onAbort);
}

export function noteRun(prefix: BackendSessionPrefix, onEvent: Emit, text: string): FollowedRun {
  onEvent({ type: "text", delta: text });
  const messages = [{ role: "assistant", content: [{ type: "text", text }] }] as Message[];
  return {
    durableId: `${prefix}-note-${crypto.randomUUID()}`,
    done: Promise.resolve({ type: "response", messages }),
    cancel: async () => undefined,
  };
}

export function subagentEventForwarder(
  emit: ((event: RunEvent) => void) | undefined,
  index: number,
): Emit {
  return (event) => {
    if (event.type === "tool_start") {
      emit?.({
        type: "subagent",
        index,
        event: {
          type: "tool_start",
          tool: {
            id: event.tool.id,
            name: event.tool.name,
            target: event.tool.target,
            status: "running",
          },
        },
      });
    } else if (event.type === "tool_end") {
      emit?.({
        type: "subagent",
        index,
        event: { type: "tool_end", id: event.id, status: event.status },
      });
    }
  };
}

export function continuationOf(
  backend: BackendSessionPrefix,
  live: { agentId: string; runId: string },
  toolCallId: string,
  toolName: string,
  questions: QuestionPrompt[],
) {
  return {
    version: 1 as const,
    agentId: live.agentId,
    sourceRunId: live.runId,
    interaction: {
      type: "tool-question" as const,
      id: toolCallId,
      toolName,
      toolCallId,
      internalCallId: toolCallId,
      questions: questions.map((question) => {
        const prompt: {
          id: string;
          text: string;
          choices?: { label: string; value: string }[];
          allowCustom?: boolean;
        } = { id: question.id, text: question.text };

        if (question.choices?.length) {
          prompt.choices = question.choices.map((choice) => ({
            label: choice.label,
            value: choice.value,
          }));
        }

        if (question.allowCustom === true) prompt.allowCustom = true;

        return prompt;
      }),
    },
    state: { backend },
  };
}

export function answered(response: AgentInteractionResponse) {
  if (response.type !== "tool-question") return "The person did not answer.";

  const lines = response.answers.map((answer) => `${answer.questionId}: ${answer.value}`);
  return `The person answered:\n${lines.join("\n")}`;
}

export function assistantText(messages: readonly Message[]) {
  const last = [...messages].reverse().find((message) => message.role === "assistant");

  if (!last) return "";

  if (typeof last.content === "string") return last.content;

  return last.content
    .flatMap((part) => (part.type === "text" && part.text.length > 0 ? [part.text] : []))
    .join("\n");
}

export function promptText(prompt: AgentPrompt) {
  return promptParts(prompt).text;
}

export function promptParts(prompt: AgentPrompt): BackendUserInput {
  if (typeof prompt === "string") return { text: prompt, images: [] };

  const content = prompt.content;

  if (typeof content === "string") return { text: content, images: [] };

  const images: BackendImage[] = [];
  for (const part of content) {
    if (part.type === "image" && part.image.type === "data" && part.mediaType) {
      images.push({ mediaType: part.mediaType, data: String(part.image.data) });
    }
  }
  return {
    text: content
      .flatMap((part) => (part.type === "text" && part.text.length > 0 ? [part.text] : []))
      .join("\n"),
    images,
  };
}
