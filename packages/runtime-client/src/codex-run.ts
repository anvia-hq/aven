import { mkdirSync } from "node:fs";
import { join } from "node:path";

import type { Message } from "@anvia/core";
import { questionsOf } from "@aven/agents/tool-projection";
import { asRecord } from "@aven/agents/values";

import { runCodexTurn } from "./codex-engine";
import { serveCodexTools } from "./codex-tools-server";
import type { CodexChat, CodexQuestion, DurableEnd } from "./types";

const EFFORTS = ["minimal", "low", "medium", "high", "xhigh"] as const;

const effortOf = (effort: string | undefined) => EFFORTS.find((known) => known === effort);

export function continuationOf(runId: string, question: CodexQuestion) {
  return {
    version: 1,
    agentId: `run-${runId}`,
    sourceRunId: runId,
    interaction: {
      type: "tool-question",
      id: question.callId,
      toolName: question.toolName,
      toolCallId: question.callId,
      internalCallId: question.callId,
      questions: questionsOf(question.input),
    },
    state: { codex: true },
  };
}

const asAnswers = (given: Record<string, unknown>[]) =>
  given.map(({ questionId, value }) => ({ questionId: String(questionId), value: String(value) }));

export function answerOf(continuation: unknown, response: unknown) {
  const { interaction } = asRecord(continuation);
  const { toolCallId, toolName, questions } = asRecord(interaction);
  const { answers } = asRecord(response);
  const asked = Array.isArray(questions) ? questions : [];
  const given = Array.isArray(answers) ? answers.map(asRecord) : [];
  const lines = given.map(({ questionId, value }) => {
    const question = asked.map(asRecord).find(({ id }) => id === questionId);
    const text = typeof question?.text === "string" ? question.text : String(questionId);
    return `- ${text}: ${String(value)}`;
  });
  const prompt = `The user answered your question${given.length === 1 ? "" : "s"}:\n${lines.join("\n")}`;
  const filed: Message[] =
    typeof toolCallId === "string" && typeof toolName === "string"
      ? [
          {
            role: "tool",
            content: [
              {
                type: "tool-result",
                toolCallId,
                toolName,
                output: { type: "json", value: { answers: asAnswers(given) } },
              },
            ],
          },
        ]
      : [];
  return { prompt, filed };
}

export async function runCodexChat(chat: CodexChat): Promise<DurableEnd> {
  const { codex, threadId } = chat;
  const asked: CodexQuestion[] = [];
  const workingDirectory = join(codex.work, threadId);
  mkdirSync(workingDirectory, { recursive: true });
  const server = await serveCodexTools({
    tools: chat.tools,
    question: (question) => asked.push(question),
  });
  try {
    const end = await runCodexTurn(
      {
        codexPath: codex.path,
        input: chat.prompt,
        threadId: codex.threads.get(threadId),
        instructions: chat.instructions,
        model: chat.model,
        effort: effortOf(chat.effort),
        workingDirectory,
        mcp: { url: server.url, token: server.token },
        env: codex.env,
        signal: chat.signal,
      },
      chat.emit,
    );
    if (end.threadId) codex.threads.set(threadId, end.threadId);
    const messages = [...chat.filed, ...end.messages];
    if (end.ended === "error") return { type: "error", error: end.error ?? "Codex stopped" };
    if (end.ended === "cancelled") return { type: "error", error: "The run was stopped" };
    const question = asked[0];
    if (question) {
      return {
        type: "interaction",
        continuation: continuationOf(chat.runId, question),
        messages,
      };
    }
    return { type: "response", messages };
  } finally {
    await server.close();
  }
}
