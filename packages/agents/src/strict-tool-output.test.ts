import { createQuestionTool, createTool } from "@anvia/core";
import { isQuestionTool, normalizeToolResultOutput, ToolOutput } from "@anvia/core/tool";
import { describe, expect, test } from "bun:test";
import { z } from "zod";

import { botAgentParts } from "./bot-agent";
import { toStrictToolOutput, withStrictToolOutput } from "./strict-tool-output";

describe("toStrictToolOutput", () => {
  test("strips undefined object properties and converts non-JSON values into strict JSON", () => {
    const date = new Date("2026-11-21T07:00:00.000Z");
    const output = toStrictToolOutput({
      id: "t1",
      createdBy: undefined,
      lastActivityAt: undefined,
      updatedAt: date,
      count: Number.NaN,
      limit: Number.POSITIVE_INFINITY,
      big: 42n,
      nested: {
        present: true,
        omitted: undefined,
        items: [1, undefined, date, { keep: "yes", drop: undefined }],
      },
    });

    expect(output).toEqual({
      id: "t1",
      updatedAt: "2026-11-21T07:00:00.000Z",
      count: null,
      limit: null,
      big: "42",
      nested: {
        present: true,
        items: [1, null, "2026-11-21T07:00:00.000Z", { keep: "yes" }],
      },
    });
    expect(normalizeToolResultOutput(output)).toEqual({
      type: "json",
      value: output as never,
    });
  });

  test("preserves strings and rich ToolOutput.content values untouched", () => {
    expect(toStrictToolOutput("plain text")).toBe("plain text");

    const rich = ToolOutput.content([{ type: "text", text: "attached" }]);
    expect(toStrictToolOutput(rich)).toBe(rich);
    expect(normalizeToolResultOutput(toStrictToolOutput(rich))).toEqual({
      type: "content",
      value: [{ type: "text", text: "attached" }],
    });
  });

  test("handles undefined return values and circular references safely", () => {
    expect(toStrictToolOutput(undefined)).toBeNull();

    const cyclic: Record<string, unknown> = { name: "loop" };
    cyclic.self = cyclic;
    const output = toStrictToolOutput(cyclic);
    expect(output).toEqual({ name: "loop", self: "[Circular]" });
    expect(normalizeToolResultOutput(output)).toEqual({
      type: "json",
      value: { name: "loop", self: "[Circular]" },
    });
  });
});

describe("withStrictToolOutput", () => {
  test("makes bot tools with optional undefined fields pass @anvia/core normalization", async () => {
    const parts = botAgentParts({
      name: "Ada",
      handle: "ada",
      instruction: "Help",
      peers: [],
      send: async () => "ok",
      threads: {
        projects: async () => [],
        list: async () => [],
        get: async (id) => ({
          id,
          title: "Upgrade codex",
          projectId: "11111111-1111-4111-8111-111111111111",
          repository: "anvia-hq/aven",
          state: "open",
          mine: true,
          createdBy: undefined,
          running: true,
          lastActivityAt: undefined,
          awaitingAnswer: false,
          pullRequests: [],
          updatedAt: "2026-11-21T07:00:00.000Z",
          turns: [],
          earlier: 0,
          question: undefined,
          questions: undefined,
          pullRequestDetails: undefined,
          pullRequestsNote: undefined,
        }),
        start: async () => {
          throw new Error("unused");
        },
        continue: async () => {
          throw new Error("unused");
        },
        archive: async () => {
          throw new Error("unused");
        },
        stop: async () => {
          throw new Error("unused");
        },
        answer: async () => {
          throw new Error("unused");
        },
      },
    });

    const getThread = parts.tools.find((tool) => tool.name === "get_thread");
    expect(getThread).toBeDefined();

    const output = await getThread!.call({ id: "22222222-2222-4222-8222-222222222222" });
    expect(() => normalizeToolResultOutput(output)).not.toThrow();
    expect(output).toEqual({
      thread: {
        id: "22222222-2222-4222-8222-222222222222",
        title: "Upgrade codex",
        projectId: "11111111-1111-4111-8111-111111111111",
        repository: "anvia-hq/aven",
        state: "open",
        mine: true,
        running: true,
        awaitingAnswer: false,
        pullRequests: [],
        updatedAt: "2026-11-21T07:00:00.000Z",
        turns: [],
        earlier: 0,
      },
    });
  });

  test("preserves tool metadata, question tools, and sync/async tool calls", async () => {
    const question = createQuestionTool();
    expect(withStrictToolOutput(question)).toBe(question);
    expect(isQuestionTool(withStrictToolOutput(question))).toBe(true);

    const syncTool = {
      name: "sync_probe",
      definition: () => ({ name: "sync_probe", description: "Probe", parameters: {} }),
      call: () => ({ ok: true, missing: undefined }),
    };

    const syncOutput = withStrictToolOutput(syncTool).call({});
    expect(syncOutput).not.toBeInstanceOf(Promise);
    expect(normalizeToolResultOutput(syncOutput)).toEqual({
      type: "json",
      value: { ok: true },
    });

    const asyncTool = createTool({
      name: "probe",
      description: "Probe",
      inputSchema: z.object({}),
      handler: () => ({ ok: true, missing: undefined }),
    });

    const asyncOutput = await withStrictToolOutput(asyncTool).call({});
    expect(normalizeToolResultOutput(asyncOutput)).toEqual({
      type: "json",
      value: { ok: true },
    });
  });
});
