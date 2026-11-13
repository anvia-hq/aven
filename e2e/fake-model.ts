const modelPort = Number(process.env.FAKE_MODEL_PORT ?? 8102);

type ChatMessage = { role: string; content?: string | { type: string; text?: string }[] | null };

const textOf = (content: ChatMessage["content"]) =>
  typeof content === "string" ? content : (content ?? []).map((part) => part.text ?? "").join("");

const heardOf = (content: ChatMessage["content"]) =>
  textOf(content)
    .replace(/^\[[mb]-\d+\] /, "")
    .replace(/^\[replying to [mb]-\d+\] [^\n]*\n/, "");

const reply = (message: Record<string, unknown>, finish: string) =>
  Response.json({
    id: "chatcmpl-fake",
    object: "chat.completion",
    created: 0,
    model: "fake-model",
    choices: [{ index: 0, message: { role: "assistant", ...message }, finish_reason: finish }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  });

const sendMessage = (id: string, text: string, to?: string) => {
  const input: { text: string; to?: string } = { text };

  if (to) input.to = to;

  return {
    id,
    type: "function",
    function: { name: "send_message", arguments: JSON.stringify(input) },
  };
};

const createBot = (id: string) => ({
  id,
  type: "function",
  function: {
    name: "create_bot",
    arguments: JSON.stringify({
      name: "Scout",
      instruction: "You research what the person asks and report what you found.",
      description: "Researches what you ask.",
    }),
  },
});

const askQuestion = (id: string) => ({
  id,
  type: "function",
  function: {
    name: "ask_question",
    arguments: JSON.stringify({
      questions: [
        {
          id: "scope",
          text: "Which should I start with?",
          choices: [
            { label: "Scout", value: "Scout" },
            { label: "Analyst", value: "Analyst" },
          ],
        },
      ],
    }),
  },
});

const createSchedule = (id: string) => ({
  id,
  type: "function",
  function: {
    name: "create_schedule",
    arguments: JSON.stringify({
      name: "Morning news",
      cron: "0 7 * * *",
      prompt: "Read the news and send the person a short summary.",
    }),
  },
});

const startGoal = (id: string) => ({
  id,
  type: "function",
  function: {
    name: "start_goal",
    arguments: JSON.stringify({ objective: "Write the report", checks: [] }),
  },
});

const completeGoal = (id: string) => ({
  id,
  type: "function",
  function: { name: "update_goal", arguments: JSON.stringify({ action: "complete" }) },
});

const updateSelf = (id: string) => ({
  id,
  type: "function",
  function: {
    name: "update_self",
    arguments: JSON.stringify({ name: "Pip", description: "Keeps you company." }),
  },
});

const addMcpServer = (id: string) => ({
  id,
  type: "function",
  function: {
    name: "add_mcp_server",
    arguments: JSON.stringify({
      name: "Docs",
      url: "https://docs.example.com/mcp",
      headers: [{ name: "Authorization", value: "Bearer given-by-the-person" }],
    }),
  },
});

const addProvider = (id: string) => ({
  id,
  type: "function",
  function: {
    name: "add_provider",
    arguments: JSON.stringify({
      kind: "azure",
      name: "Work Azure",
      baseUrl: "https://work.openai.azure.com",
      modelId: "gpt-5",
    }),
  },
});

const askProviderKey = (id: string, providerId: string) => ({
  id,
  type: "function",
  function: { name: "ask_provider_key", arguments: JSON.stringify({ id: providerId }) },
});

const toolCall = (id: string, name: string, args: object = {}) => ({
  id,
  type: "function",
  function: { name, arguments: JSON.stringify(args) },
});

const SAID_AFTER: Record<string, string> = {
  create_bot: "Scout is ready",
  update_self: "I am Pip now",
  create_schedule: "Scheduled: Morning news",
  start_goal: "Working on it in the background",
  update_goal: "Goal finished: the report is written",
  add_mcp_server: "Docs is connected",
  start_thread: "Started the thread",
  archive_thread: "Archived the thread",
};

const heardNow = (messages: ChatMessage[]) =>
  heardOf(messages.findLast((message) => message.role === "user")?.content);

const THREAD_PROMPT = "Fix the e2e build";

type Turn = ChatMessage & { tool_calls?: { function: { name: string; arguments?: string } }[] };

const calledTool = (message: Turn | undefined, name: string) =>
  message?.tool_calls?.some((call) => call.function.name === name) ?? false;

const askedABot = (message: Turn) =>
  (message.tool_calls ?? []).some(
    (call) =>
      call.function.name === "send_message" &&
      (JSON.parse(call.function.arguments ?? "{}") as { to?: string }).to !== undefined,
  );
const madeABot = (message: Turn) => calledTool(message, "create_bot");
const changedItself = (message: Turn) => calledTool(message, "update_self");

Bun.serve({
  port: modelPort,
  async fetch(request) {
    const { pathname } = new URL(request.url);

    if (pathname === "/health") return new Response("ok");

    if (!pathname.endsWith("/chat/completions")) return new Response("not found", { status: 404 });

    const body = (await request.json()) as { messages: ChatMessage[]; stream?: boolean };

    if (body.stream) return new Response("the fake model does not stream", { status: 400 });

    const last = body.messages.at(-1);

    if (last?.role === "tool") {
      const call = body.messages.findLast((message) => message.role === "assistant");

      if (calledTool(call, "add_provider")) {
        const providerId = /"id":"([0-9a-f-]{36})"/.exec(textOf(last.content))?.[1];

        if (providerId) {
          return reply(
            { content: null, tool_calls: [askProviderKey("call_2", providerId)] },
            "tool_calls",
          );
        }
      }

      if (calledTool(call, "list_projects")) {
        const projectId = /"id":"([0-9a-f-]{36})"/.exec(textOf(last.content))?.[1];

        if (projectId) {
          const start = toolCall("call_2", "start_thread", {
            projectId,
            prompt: THREAD_PROMPT,
          });
          return reply({ content: null, tool_calls: [start] }, "tool_calls");
        }
      }

      if (calledTool(call, "list_threads")) {
        const threadId = new RegExp(`"id":"([0-9a-f-]{36})","title":"${THREAD_PROMPT}"`).exec(
          textOf(last.content),
        )?.[1];

        if (threadId) {
          const archive = toolCall("call_2", "archive_thread", { id: threadId });
          return reply({ content: null, tool_calls: [archive] }, "tool_calls");
        }
      }

      if (
        calledTool(call, "exec_command") &&
        /(send|update) the report/i.test(heardNow(body.messages))
      ) {
        const version = /update the report/i.test(heardNow(body.messages)) ? 2 : 1;
        const file = toolCall("call_2", "send_message", {
          text: `Here is the report, version ${version}`,
          files: [{ path: "report.md", title: "Weekly report" }],
        });
        return reply({ content: null, tool_calls: [file] }, "tool_calls");
      }

      const said = Object.entries(SAID_AFTER).find(([tool]) => calledTool(call, tool))?.[1];

      if (!said) return reply({ content: "ok" }, "stop");

      return reply({ content: null, tool_calls: [sendMessage("call_2", said)] }, "tool_calls");
    }

    const heard = heardOf(last?.content);

    if (/(send|update) the report/i.test(heard)) {
      const version = /update the report/i.test(heard) ? 2 : 1;
      const write = toolCall("call_1", "exec_command", {
        command: `printf '# Weekly report\n\nAll good in version ${version}.' > report.md`,
      });
      return reply({ content: null, tool_calls: [write] }, "tool_calls");
    }

    if (/make a bot/i.test(heard) && !body.messages.some(madeABot)) {
      return reply({ content: null, tool_calls: [createBot("call_1")] }, "tool_calls");
    }

    if (heard.startsWith("[note] You were just created")) {
      return reply(
        { content: null, tool_calls: [sendMessage("call_1", "Hello, I am your new bot")] },
        "tool_calls",
      );
    }

    if (/ask @/i.test(heard) && !body.messages.some(askedABot)) {
      const everything = body.messages.map((message) => textOf(message.content)).join("\n");
      const peer = /- .+ \(handle: ([a-z0-9-]+)\)/.exec(everything)?.[1];

      if (peer) {
        return reply(
          {
            content: null,
            tool_calls: [
              sendMessage("call_1", "I asked Scout"),
              sendMessage("call_2", "A, B and C", peer),
            ],
          },
          "tool_calls",
        );
      }
    }

    if (heard.startsWith("[from main]")) {
      await Bun.sleep(1500);
      return reply(
        { content: null, tool_calls: [sendMessage("call_1", `You said: ${heard}`, "main")] },
        "tool_calls",
      );
    }

    if (heard.startsWith("[from ")) {
      return reply(
        { content: null, tool_calls: [sendMessage("call_1", "Scout answered")] },
        "tool_calls",
      );
    }

    if (heard.startsWith("[note] Webhook ")) {
      return reply(
        {
          content: null,
          tool_calls: [sendMessage("call_1", "Webhook received: checking the report")],
        },
        "tool_calls",
      );
    }

    if (/need a decision/i.test(heard)) {
      return reply({ content: null, tool_calls: [askQuestion("call_1")] }, "tool_calls");
    }

    if (heard.startsWith("[note] Goal round")) {
      if (body.messages.some((message) => calledTool(message, "update_goal"))) {
        return reply({ content: "ok" }, "stop");
      }

      return reply({ content: null, tool_calls: [completeGoal("call_1")] }, "tool_calls");
    }

    if (
      /start a goal/i.test(heard) &&
      !body.messages.some((message) => calledTool(message, "start_goal"))
    ) {
      return reply({ content: null, tool_calls: [startGoal("call_1")] }, "tool_calls");
    }

    if (
      /every morning/i.test(heard) &&
      !body.messages.some((message) => calledTool(message, "create_schedule"))
    ) {
      return reply({ content: null, tool_calls: [createSchedule("call_1")] }, "tool_calls");
    }

    if (/your skills/i.test(heard)) {
      const everything = body.messages.map((message) => textOf(message.content)).join("\n");
      const skill = /Available skills:\n- ([a-z0-9-]+):/.exec(everything)?.[1];
      const said = skill ? `I have the ${skill} skill` : "I have no skills";
      return reply({ content: null, tool_calls: [sendMessage("call_1", said)] }, "tool_calls");
    }

    if (
      /connect .*mcp server/i.test(heard) &&
      !body.messages.some((message) => calledTool(message, "add_mcp_server"))
    ) {
      return reply({ content: null, tool_calls: [addMcpServer("call_1")] }, "tool_calls");
    }

    if (
      /add .*provider/i.test(heard) &&
      !body.messages.some((message) => calledTool(message, "add_provider"))
    ) {
      return reply({ content: null, tool_calls: [addProvider("call_1")] }, "tool_calls");
    }

    if (
      /start a thread/i.test(heard) &&
      !body.messages.some((m) => calledTool(m, "list_projects"))
    ) {
      return reply(
        { content: null, tool_calls: [toolCall("call_1", "list_projects")] },
        "tool_calls",
      );
    }

    if (
      /archive the thread/i.test(heard) &&
      !body.messages.some((m) => calledTool(m, "list_threads"))
    ) {
      return reply(
        { content: null, tool_calls: [toolCall("call_1", "list_threads")] },
        "tool_calls",
      );
    }

    if (/saved the api key/i.test(heard)) {
      return reply(
        { content: null, tool_calls: [sendMessage("call_1", "Work Azure is ready")] },
        "tool_calls",
      );
    }

    if (/call yourself/i.test(heard) && !body.messages.some(changedItself)) {
      return reply({ content: null, tool_calls: [updateSelf("call_1")] }, "tool_calls");
    }

    if (
      /react to my plan/i.test(heard) &&
      !body.messages.some((message) => calledTool(message, "react_to_message"))
    ) {
      return reply(
        {
          content: null,
          tool_calls: [
            toolCall("call_1", "react_to_message", { messageId: "m-0", emoji: "👍" }),
            toolCall("call_2", "send_message", { text: "Good plan", quote: "m-0" }),
          ],
        },
        "tool_calls",
      );
    }

    return reply(
      {
        content: null,
        tool_calls: [
          sendMessage("call_1", "Hey there!"),
          sendMessage("call_2", `You said: ${heard}`),
        ],
      },
      "tool_calls",
    );
  },
});

console.log(`fake model listening on ${modelPort}`);
