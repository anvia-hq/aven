import { describe, expect, test } from "bun:test";
import { createTool } from "@anvia/core";
import { z } from "zod";

import { createCodingAgent } from "./coding-agent";
import { createMemoryStore } from "./memory";
import { createModel } from "./model";
import { createEditTool } from "./tools/edit";

// Just enough surface for the store's constructor checks; nothing here touches a database.
const noop = () => undefined;
const stubDb = { select: noop, insert: noop, delete: noop, transaction: noop, execute: noop };

const echo = createTool({
  name: "echo",
  description: "Returns its input.",
  inputSchema: z.object({ text: z.string() }),
  execute: ({ text }) => text,
});

describe("createCodingAgent", () => {
  test.each(["openai", "anthropic"] as const)(
    "gives the agent the tools it was handed (%s)",
    (provider) => {
      const { agent } = createCodingAgent({
        provider,
        apiKey: "test-key",
        tools: [echo],
        webSearch: false,
      });
      expect(agent.tools.map((tool) => tool.name)).toEqual(["echo"]);
    },
  );

  test("accepts a memory store", () => {
    const store = createMemoryStore(stubDb);
    const { agent } = createCodingAgent({
      provider: "openai",
      apiKey: "test-key",
      tools: [],
      webSearch: false,
      memory: store,
    });
    expect(agent.memory?.store).toBe(store);
    expect(agent.memory?.savePolicy).toBe("turn");
  });

  test("adds web_search when enabled", () => {
    const { agent } = createCodingAgent({
      provider: "openai",
      apiKey: "test-key",
      tools: [echo],
      webSearch: true,
    });
    expect(agent.tools.map((tool) => tool.name)).toEqual(["echo", "web_search"]);
  });

  test("tells the agent to use processes, not foreground commands, for servers", () => {
    const { agent } = createCodingAgent({
      provider: "openai",
      apiKey: "test-key",
      tools: [],
      webSearch: false,
    });
    expect(agent.instructions).toContain("start_process");
    expect(agent.instructions).not.toContain("notified");
  });
});

describe("tool calls through the agent", () => {
  test("parse and run model-style JSON arguments", async () => {
    const files = new Map([["a.txt", "hello"]]);
    const { agent } = createCodingAgent({
      provider: "anthropic",
      apiKey: "test-key",
      webSearch: false,
      tools: [
        createEditTool({
          workdir: "/workspace",
          readTextFile: async ({ path }) => files.get(path) ?? "",
          writeTextFile: async ({ path, text }) => void files.set(path, text),
        }),
      ],
    });
    await agent.callTool(
      "edit",
      JSON.stringify({ path: "a.txt", oldString: "hello", newString: "bye" }),
    );
    expect(files.get("a.txt")).toBe("bye");
  });
});

describe("createModel", () => {
  test("requires the provider's API key", () => {
    const saved = { ...process.env };
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      expect(() => createModel({ provider: "openai" })).toThrow("OPENAI_API_KEY");
      expect(() => createModel({ provider: "anthropic" })).toThrow("ANTHROPIC_API_KEY");
    } finally {
      Object.assign(process.env, saved);
    }
  });
});
