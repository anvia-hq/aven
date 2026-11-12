import { afterEach, describe, expect, test } from "bun:test";
import { createQuestionTool, createTool } from "@anvia/core";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { ThreadEvent } from "@openai/codex-sdk";

import { CODEX_LOGIN_MISSING, CODEX_NOTHING_TO_COMPACT } from "@aven/protocol/codex-login";
import type { RunEvent } from "@aven/protocol/types";

import { CodexRuns, promptText } from "./codex-backend";
import { CODEX_FAKE_REPLY, type CodexQuery } from "./codex-fake";
import { journalPath } from "./testing/journal-path";
import type { CodexRunContext, RunInput } from "./types";

const access = "eyJhbGciOiJub25lIn0.payload.signature";
const refresh = "refresh-token-value-9988";
const login = JSON.stringify({ tokens: { access_token: access, refresh_token: refresh } });

const usage = {
  input_tokens: 1,
  output_tokens: 1,
  cached_input_tokens: 0,
  cache_write_input_tokens: 0,
  reasoning_output_tokens: 0,
};

const echo = createTool({
  name: "exec_command",
  description: "Run a command",
  inputSchema: z.object({ command: z.string() }),
  execute: ({ command }, context) => {
    context?.abortSignal?.throwIfAborted();
    return { status: "exited", exitCode: 0, stdout: command, stderr: "" };
  },
});

function context(extra: Partial<CodexRunContext> = {}): RunInput {
  return {
    codex: {
      login,
      instructions: "Use the aven tools.",
      tools: [echo, createQuestionTool()],
      questions: true,
      children: false,
      rememberSession: true,
      ...extra,
    },
  };
}

function message(id: string, text: string): ThreadEvent {
  return { type: "item.completed", item: { id, type: "agent_message", text } };
}

const opened: CodexRuns[] = [];

afterEach(async () => {
  await Promise.all(opened.splice(0).map((runs) => runs.close()));
});

function open(query: CodexQuery, path = journalPath()) {
  const runs = CodexRuns.open(path, query);
  opened.push(runs);
  return { runs, path, home: `${path}.codex-home`, sessions: `${path}.codex` };
}

describe("CodexRuns", () => {
  test("answers on the fake Codex session and keeps the login out of the journal and the home", async () => {
    const { runs, home, sessions } = open(async function* (input) {
      expect(input.env.CODEX_ACCESS_TOKEN).toBe(access);
      expect(Object.values(input.env).join("\n")).not.toContain(refresh);
      yield { type: "thread.started", thread_id: "session-1" };
      yield message("m", CODEX_FAKE_REPLY);
      yield { type: "turn.completed", usage };
    });
    const events: RunEvent[] = [];
    const followed = await runs.start("run-1", "thread-1", "hello", context(), (event) => {
      events.push(event);
    });
    const end = await followed.done;

    expect(end.type).toBe("response");
    expect(events.some((event) => event.type === "text" && event.delta === CODEX_FAKE_REPLY)).toBe(
      true,
    );
    expect(readdirSync(home)).not.toContain("auth.json");
    expect(readFileSync(sessions).toString()).not.toContain(access);
    expect(readFileSync(sessions).toString()).not.toContain(refresh);
    expect(readTree(home)).not.toContain(access);
  });

  test("refuses a run with no login and does not call Codex", async () => {
    let called = false;
    const { runs } = open(async function* () {
      called = true;
      yield { type: "thread.started", thread_id: "nope" };
    });

    await expect(
      runs.start("run-1", "thread-1", "hello", context({ login: "short" }), () => undefined),
    ).rejects.toThrow(CODEX_LOGIN_MISSING);
    expect(called).toBe(false);
  });

  test("compacts nothing without calling Codex", async () => {
    let called = false;
    const { runs } = open(async function* () {
      called = true;
      yield { type: "thread.started", thread_id: "nope" };
    });
    const events: RunEvent[] = [];
    const followed = await runs.start(
      "run-1",
      "thread-1",
      "compact",
      context({ compact: true }),
      (event) => events.push(event),
    );
    const end = await followed.done;

    expect(called).toBe(false);
    expect(end.type).toBe("response");
    expect(events).toContainEqual({ type: "text", delta: CODEX_NOTHING_TO_COMPACT });
  });

  test("queues a steer as the next turn on the same session", async () => {
    let release: () => void = () => undefined;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const prompts: string[] = [];
    const { runs } = open(async function* (input) {
      prompts.push(input.prompt);
      yield { type: "thread.started", thread_id: input.sessionId ?? "session-1" };
      await hold;
      yield message(`m-${prompts.length}`, input.prompt);
      yield { type: "turn.completed", usage };
    });
    const followed = await runs.start("run-1", "thread-1", "first", context(), () => undefined);
    await Bun.sleep(20);
    expect(await runs.steer(followed.durableId, "second")).toBe(true);
    release();
    const end = await followed.done;

    expect(prompts).toEqual(["first", "second"]);
    expect(end.type).toBe("response");
  });

  test("an answer while the process is up continues the same turn", async () => {
    const { runs } = open(async function* (input) {
      yield { type: "thread.started", thread_id: "session-1" };
      const heard = await input.callTool!("ask_user", {
        questions: [{ id: "q1", text: "Which?" }],
      });
      yield message("m", heard);
      yield { type: "turn.completed", usage };
    });
    const followed = await runs.start("run-1", "thread-1", "ask", context(), () => undefined);
    const parked = await followed.done;
    expect(parked.type).toBe("interaction");
    const asked = await runs.asked("thread-1");
    const resumed = await runs.answer(
      asked!,
      { id: "i", toolCallId: "c" },
      { type: "tool-question", answers: [{ questionId: "q1", value: "red" }] },
      () => context(),
      () => undefined,
    );
    const end = await resumed.done;

    expect(end.type).toBe("response");
    expect(JSON.stringify(end.type === "response" ? end.messages : [])).toContain("red");
  });

  test("an answer after the process is gone is the next message on the saved session", async () => {
    const prompts: string[] = [];
    const query: CodexQuery = async function* (input) {
      prompts.push(input.prompt);
      yield { type: "thread.started", thread_id: input.sessionId ?? "session-1" };

      if (input.callTool && input.prompt === "ask") {
        await input.callTool("ask_user", { questions: [{ id: "q1", text: "Which?" }] });
      }

      yield message("m", input.prompt);
      yield { type: "turn.completed", usage };
    };
    const path = journalPath();
    const first = open(query, path);
    const followed = await first.runs.start("run-1", "thread-1", "ask", context(), () => undefined);
    await followed.done;
    const asked = await first.runs.asked("thread-1");
    await first.runs.close();
    opened.splice(opened.indexOf(first.runs), 1);

    const second = open(query, path);
    const resumed = await second.runs.answer(
      asked!,
      { id: "i", toolCallId: "c" },
      { type: "tool-question", answers: [{ questionId: "q1", value: "blue" }] },
      () => context(),
      () => undefined,
    );
    const end = await resumed.done;

    expect(end.type).toBe("response");
    expect(prompts.at(-1)).toContain("blue");
    expect(prompts.at(-1)).toContain("The user answered");
  });

  test("a subagent is another Codex session and cannot ask or spawn", async () => {
    const seen: { prompt: string; instructions: string }[] = [];
    const { runs } = open(async function* (input) {
      seen.push({ prompt: input.prompt, instructions: input.config.developer_instructions });
      yield { type: "thread.started", thread_id: `session-${seen.length}` };

      if (input.callTool && input.prompt === "parent") {
        const answer = await input.callTool("spawn_agent", {
          tasks: [{ description: "Look around", prompt: "look around", type: "explore" }],
        });
        yield message("m", answer);
      } else {
        yield message("m", "found it");
      }

      yield { type: "turn.completed", usage };
    });
    const events: RunEvent[] = [];
    const followed = await runs.start(
      "run-1",
      "thread-1",
      "parent",
      context({ children: true }),
      (event) => events.push(event),
    );
    const end = await followed.done;
    const child = seen.find((turn) => turn.prompt === "look around");

    expect(end.type).toBe("response");
    expect(child?.instructions).toContain("aven");
    expect(child?.instructions).not.toContain("ask_user");
    expect(events.some((event) => event.type === "subagent")).toBe(true);
  });

  test("cancel stops the turn", async () => {
    const { runs } = open(async function* (input) {
      yield { type: "thread.started", thread_id: "session-1" };
      await new Promise((_resolve, reject) => {
        input.signal.addEventListener("abort", () => reject(input.signal.reason));
      });
    });
    const followed = await runs.start("run-1", "thread-1", "go", context(), () => undefined);
    await runs.cancelRun(followed.durableId);
    const end = await followed.done;

    expect(end).toMatchObject({ type: "error", error: "The run was cancelled" });
  });
});

test("prompt text keeps the words and drops image bytes", () => {
  expect(
    promptText({
      role: "user",
      content: [
        { type: "text", text: "see this" },
        { type: "image", image: { type: "data", data: "AAAA" }, mediaType: "image/png" },
      ],
    }),
  ).toBe("see this");
});

function readTree(dir: string): string {
  return readdirSync(dir, { withFileTypes: true })
    .map((entry) =>
      entry.isDirectory()
        ? readTree(join(dir, entry.name))
        : readFileSync(join(dir, entry.name)).toString(),
    )
    .join("\n");
}
