import { describe, expect, test } from "bun:test";

import { messagesToChat } from "@aven/agents/projection";
import { journalPath } from "@aven/agent-backend/testing/journal-path";
import type { HostedRunContext } from "@aven/agent-backend/types";
import { questionAnswers } from "@aven/protocol/events";
import type { RunEvent } from "@aven/protocol/types";

import { ClaudeRuns } from "./backend";
import type { ClaudeQuery } from "./types";

const context = (): HostedRunContext => ({
  token: "setup-token-run-end-0001",
  workspace: async () => "/work",
  redact: (text) => text,
  env: [],
  tools: {},
});

const turn = (text: string) =>
  [
    { type: "assistant", session_id: "sess-end", message: { content: [{ type: "text", text }] } },
    {
      type: "result",
      subtype: "success",
      session_id: "sess-end",
      usage: { input_tokens: 1, output_tokens: 1 },
    },
  ] as const;

function likeTheSdk(beforeFirstResult?: Promise<void>): ClaudeQuery {
  return async function* (input) {
    const prompts = input.prompt[Symbol.asyncIterator]();
    await prompts.next();
    await beforeFirstResult;
    yield* turn("one");
    const next = await prompts.next();

    if (next.done) return;

    yield* turn(`two ${next.value}`);
    await prompts.next();
  };
}

function withTimeout<T>(work: Promise<T>) {
  return Promise.race([
    work,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("the run never ended")), 3000),
    ),
  ]);
}

describe("a Claude run ends when its answer is complete", () => {
  test("although the SDK keeps waiting for another prompt, as it does in streaming input", async () => {
    const runs = ClaudeRuns.open(journalPath(), likeTheSdk());
    const followed = await runs.start(
      "run-end-1",
      "thread-end-1",
      "go",
      { claude: context() },
      () => undefined,
    );
    const end = await withTimeout(followed.done);
    await runs.close();
    expect(end.type).toBe("response");
  });

  test("a steering message sent before the answer ends is answered first", async () => {
    const release = Promise.withResolvers<void>();
    const runs = ClaudeRuns.open(journalPath(), likeTheSdk(release.promise));
    const followed = await runs.start(
      "run-end-2",
      "thread-end-2",
      "go",
      { claude: context() },
      () => undefined,
    );
    await runs.steer(followed.durableId, "and this", "steer-1");
    release.resolve();
    const end = await withTimeout(followed.done);
    await runs.close();
    expect(end.type).toBe("response");
    expect(JSON.stringify(end)).toContain("two and this");
  });

  test("cancelling a parked question clears the stored question so asked returns undefined", async () => {
    const parked = Promise.withResolvers<void>();
    const query: ClaudeQuery = async function* (input) {
      const prompts = input.prompt[Symbol.asyncIterator]();
      await prompts.next();
      yield { type: "assistant", session_id: "sess-cancel", message: { content: [] } };
      const waiting = input.tools.onPark?.({
        name: "ask_user",
        questions: [{ id: "color", text: "Which color?" }],
      });
      parked.resolve();
      await waiting?.catch(() => undefined);
    };
    const runs = ClaudeRuns.open(journalPath(), query);
    const followed = await runs.start(
      "run-park-cancel",
      "thread-park-cancel",
      "ask me",
      { claude: context() },
      () => undefined,
    );
    await parked.promise;
    const interaction = await withTimeout(followed.done);
    expect(interaction.type).toBe("interaction");
    expect(await runs.asked("thread-park-cancel")).toBeDefined();

    await followed.cancel();
    expect(await runs.asked("thread-park-cancel")).toBeUndefined();
    await runs.close();
  });

  test("answers a parked question with JSON so live tool_end and reloaded transcript keep the answers", async () => {
    const parked = Promise.withResolvers<void>();
    const query: ClaudeQuery = async function* (input) {
      const prompts = input.prompt[Symbol.asyncIterator]();
      await prompts.next();
      yield {
        type: "assistant",
        session_id: "sess-ask",
        message: {
          content: [
            {
              type: "tool_use",
              id: "call-ask",
              name: "mcp__aven__ask_user",
              input: { questions: [{ id: "color", text: "Which color?" }] },
            },
          ],
        },
      };
      const waiting = input.tools.onPark?.({
        name: "ask_user",
        questions: [{ id: "color", text: "Which color?" }],
      });
      parked.resolve();
      const answer = await waiting;
      yield {
        type: "user",
        session_id: "sess-ask",
        message: {
          content: [{ type: "tool_result", tool_use_id: "call-ask", content: answer ?? "" }],
        },
      };
      yield* turn("Got it, blue.");
      await prompts.next();
    };
    const runs = ClaudeRuns.open(journalPath(), query);
    const firstEvents: RunEvent[] = [];
    const followed = await runs.start(
      "run-ask-1",
      "thread-ask-1",
      "pick a color",
      { claude: context() },
      (event) => firstEvents.push(event),
    );
    await parked.promise;
    const interaction = await withTimeout(followed.done);
    expect(interaction.type).toBe("interaction");
    const asked = await runs.asked("thread-ask-1");
    expect(asked).toBeDefined();

    const resumeEvents: RunEvent[] = [];
    const resumed = await runs.answer(
      asked!,
      { id: "call-ask", toolCallId: "call-ask" },
      { type: "tool-question", answers: [{ questionId: "color", value: "blue" }] },
      () => ({ claude: context() }),
      (event) => resumeEvents.push(event),
    );
    const done = await withTimeout(resumed.done);
    await runs.close();
    expect(done.type).toBe("response");
    expect(resumeEvents).toContainEqual({
      type: "tool_end",
      id: "call-ask",
      status: "done",
      output: JSON.stringify({ answers: [{ questionId: "color", value: "blue" }] }),
    });

    if (interaction.type === "interaction" && done.type === "response") {
      const chat = messagesToChat([...interaction.messages, ...done.messages]);
      const assistant = chat.find((message) => message.role === "assistant");
      const askTool = assistant?.parts.find((part) => part.type === "tool")?.tool;
      expect(askTool && questionAnswers(askTool)).toEqual([{ questionId: "color", value: "blue" }]);
    }
  });

  test("cold-resuming a parked question after restart records the tool answer without a fake user message", async () => {
    const path = journalPath();
    const parked = Promise.withResolvers<void>();
    const firstQuery: ClaudeQuery = async function* (input) {
      const prompts = input.prompt[Symbol.asyncIterator]();
      await prompts.next();
      yield {
        type: "assistant",
        session_id: "sess-cold",
        message: {
          content: [
            {
              type: "tool_use",
              id: "call-cold",
              name: "mcp__aven__ask_user",
              input: { questions: [{ id: "next", text: "What next?" }] },
            },
          ],
        },
      };
      const waiting = input.tools.onPark?.({
        name: "ask_user",
        questions: [{ id: "next", text: "What next?" }],
      });
      parked.resolve();
      await waiting?.catch(() => undefined);
    };
    const first = ClaudeRuns.open(path, firstQuery);
    const started = await first.start(
      "run-cold-1",
      "thread-cold-1",
      "start",
      { claude: context() },
      () => undefined,
    );
    await parked.promise;
    const interaction = await withTimeout(started.done);
    expect(interaction.type).toBe("interaction");
    const asked = await first.asked("thread-cold-1");
    expect(asked).toBeDefined();

    const second = ClaudeRuns.open(path, likeTheSdk());
    const resumeEvents: RunEvent[] = [];
    const resumed = await second.answer(
      asked!,
      { id: "call-cold", toolCallId: "call-cold" },
      { type: "tool-question", answers: [{ questionId: "next", value: "Ship it" }] },
      () => ({ claude: context() }),
      (event) => resumeEvents.push(event),
    );
    const done = await withTimeout(resumed.done);
    await second.close();
    await first.close();
    expect(done.type).toBe("response");
    expect(resumeEvents).toContainEqual({
      type: "tool_end",
      id: "call-cold",
      status: "done",
      output: JSON.stringify({ answers: [{ questionId: "next", value: "Ship it" }] }),
    });

    if (interaction.type === "interaction" && done.type === "response") {
      expect(done.messages.filter((message) => message.role === "user")).toHaveLength(0);
      const chat = messagesToChat([...interaction.messages, ...done.messages]);
      const assistant = chat.find((message) => message.role === "assistant");
      const askTool = assistant?.parts.find((part) => part.type === "tool")?.tool;
      expect(askTool && questionAnswers(askTool)).toEqual([
        { questionId: "next", value: "Ship it" },
      ]);
    }
  });
});
