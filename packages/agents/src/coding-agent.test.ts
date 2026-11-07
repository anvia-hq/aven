import { describe, expect, test } from "bun:test";
import { createTool, type Message } from "@anvia/core";
import { z } from "zod";

import { createCodingAgent } from "./coding-agent";
import { createModel } from "./model";
import { scriptedModel, text } from "./testing/scripted-model";
import { createEditTool } from "./tools/edit";

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
        questions: false,
      });
      expect(agent.tools.map((tool) => tool.name)).toEqual(["echo"]);
    },
  );

  test("gives the agent ask_user and request_secret unless turned off", () => {
    const base = { provider: "openai", apiKey: "test-key", tools: [], webSearch: false } as const;
    expect(createCodingAgent(base).agent.tools.map((tool) => tool.name)).toEqual([
      "ask_user",
      "request_secret",
    ]);
    expect(createCodingAgent({ ...base, questions: false }).agent.tools).toEqual([]);
  });

  test("takes the instructions it is given instead of the coding agent's", () => {
    const base = {
      provider: "openai",
      apiKey: "test-key",
      tools: [],
      webSearch: false,
      questions: false,
    } as const;
    expect(createCodingAgent(base).agent.instructions).toContain("<role>");
    expect(createCodingAgent({ ...base, instructions: "Only look." }).agent.instructions).toBe(
      "Only look.",
    );
  });

  test("tells the agent how to fork its thread only when the host gives it the tools (decision 0135)", () => {
    const base = { provider: "openai", apiKey: "test-key", tools: [], webSearch: false } as const;
    expect(createCodingAgent(base).agent.instructions).not.toContain("<forks>");
    const told = createCodingAgent({ ...base, forks: true }).agent.instructions;
    expect(told).toContain("<forks>");
    expect(told).toContain("only when the user's own message asks");
    expect(told).toContain("</forks>");
  });

  test("a question suspends the run and the answer resumes it", async () => {
    const model = scriptedModel([
      [
        {
          type: "tool-call",
          toolCallId: "q1",
          toolName: "ask_user",
          input: {
            questions: [
              {
                id: "color",
                text: "Which color?",
                choices: [
                  { label: "Red", value: "red" },
                  { label: "Blue", value: "blue" },
                ],
              },
            ],
          },
        },
      ],
      [text("Going with red")],
    ]);
    const { agent } = createCodingAgent({ model, tools: [], webSearch: false });

    const first = agent.stream({ prompt: "paint it" });
    for await (const _event of first);
    const suspended = await first.result;
    if (suspended.type !== "interaction")
      throw new Error(`expected a suspension, got ${suspended.type}`);
    expect(suspended.interaction.type).toBe("tool-question");

    const second = agent.stream({
      continuation: suspended.continuation,
      response: { type: "tool-question", answers: [{ questionId: "color", value: "red" }] },
    });
    for await (const _event of second);
    const done = await second.result;
    expect(done.type).toBe("response");
  });

  test("adds web_search when enabled", () => {
    const { agent } = createCodingAgent({
      provider: "openai",
      apiKey: "test-key",
      tools: [echo],
      webSearch: true,
      questions: false,
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

  test("tells the agent to mint an identity token rather than ask for a key a service can trust", () => {
    const { agent } = createCodingAgent({
      provider: "openai",
      apiKey: "test-key",
      tools: [],
      webSearch: false,
    });
    expect(agent.instructions).toContain("aven id-token --audience");
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

describe("history from earlier runs", () => {
  const reasoning = {
    type: "reasoning" as const,
    id: "rs_earlier",
    text: "",
    details: [{ type: "text" as const, text: "", signature: "sig" }],
  };
  const messages: Message[] = [
    { role: "user", content: "What is this app about?" },
    {
      role: "assistant",
      content: [reasoning, { type: "text", text: "It is a monorepo." }],
    },
    { role: "user", content: "Thanks" },
  ];

  async function sentToAnthropic() {
    const bodies: unknown[] = [];
    const server = Bun.serve({
      port: 0,
      async fetch(request) {
        if (new URL(request.url).pathname.endsWith("/messages")) bodies.push(await request.json());
        return new Response("refused on purpose", { status: 400 });
      },
    });
    try {
      const { agent } = createCodingAgent({
        provider: "anthropic",
        apiKey: "sk-local",
        baseUrl: `http://localhost:${server.port}`,
        tools: [],
        webSearch: false,
      });
      const stream = agent.stream({ messages });
      await (async () => {
        for await (const _ of stream) void _;
        await stream.result;
      })().catch(() => undefined);
    } finally {
      await server.stop(true);
    }
    return JSON.stringify(bodies[0]);
  }

  test("an Anthropic run does not replay another provider's reasoning", async () => {
    const body = await sentToAnthropic();
    expect(body).toContain("It is a monorepo.");
    expect(body).not.toContain("thinking");
    expect(body).not.toContain("rs_earlier");
  });
});
