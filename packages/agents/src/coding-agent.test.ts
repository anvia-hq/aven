import { describe, expect, test } from "bun:test";
import { join } from "node:path";

import { createCodingAgent } from "./coding-agent";
import { createMemoryStore } from "./memory";
import { createModel } from "./model";

// Just enough surface for the store's constructor checks; nothing here touches a database.
const noop = () => undefined;
const stubDb = { select: noop, insert: noop, delete: noop, transaction: noop, execute: noop };

describe("createCodingAgent", () => {
  test.each(["openai", "anthropic"] as const)("assembles the tools for %s", (provider) => {
    const { agent, jobs } = createCodingAgent({
      provider,
      apiKey: "test-key",
      root: process.cwd(),
      webSearch: false,
    });
    expect(agent.tools.map((tool) => tool.name)).toEqual([
      "read",
      "write",
      "edit",
      "shell",
      "shell_output",
      "shell_kill",
    ]);
    expect(jobs.list()).toEqual([]);
  });

  test("accepts a memory store", () => {
    const store = createMemoryStore(stubDb);
    const { agent } = createCodingAgent({
      provider: "openai",
      apiKey: "test-key",
      root: process.cwd(),
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
      root: process.cwd(),
      webSearch: true,
    });
    expect(agent.tools.map((tool) => tool.name)).toContain("web_search");
  });
});

describe("tool calls through the agent", () => {
  test("parse and run model-style JSON arguments", async () => {
    const { agent } = createCodingAgent({
      provider: "anthropic",
      apiKey: "test-key",
      root: join(import.meta.dir, ".."),
      webSearch: false,
    });
    const read = await agent.callTool("read", JSON.stringify({ path: "package.json" }));
    expect(JSON.stringify(read)).toContain("@aven/agents");

    const shell = await agent.callTool("shell", JSON.stringify({ command: "echo hi" }));
    expect(JSON.stringify(shell)).toContain("hi");
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
