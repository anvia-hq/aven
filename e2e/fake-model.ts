// A pretend OpenAI-compatible model for the bots' e2e (decisions 0058 and 0059): a bot answers on a
// runner, whose model calls go through the control plane's gateway to the person's provider. Told
// something, it sends two messages with `send_message`: a greeting and what it heard; given the
// tool's results, it stops.
const modelPort = Number(process.env.FAKE_MODEL_PORT ?? 8102);

type ChatMessage = { role: string; content?: string | { type: string; text?: string }[] | null };

const textOf = (content: ChatMessage["content"]) =>
  typeof content === "string" ? content : (content ?? []).map((part) => part.text ?? "").join("");

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

// What the bot says once the tool it called has answered.
const SAID_AFTER: Record<string, string> = {
  create_bot: "Scout is ready",
  update_self: "I am Pip now",
  create_schedule: "Scheduled: Morning news",
  start_goal: "Working on it in the background",
  update_goal: "Goal finished: the report is written",
  add_mcp_server: "Docs is connected",
};

type Turn = ChatMessage & { tool_calls?: { function: { name: string; arguments?: string } }[] };

const calledTool = (message: Turn | undefined, name: string) =>
  message?.tool_calls?.some((call) => call.function.name === name) ?? false;

// A bot has written to another when a `send_message` of its went to a handle, not the person.
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
      // After a bot is made it is said; after anything else the model stops.
      const call = body.messages.findLast((message) => message.role === "assistant");
      // A provider it has just added has no key: the bot shows the person the form for it
      // (decision 0086) and stops, as the form asks.
      if (calledTool(call, "add_provider")) {
        const providerId = /"id":"([0-9a-f-]{36})"/.exec(textOf(last.content))?.[1];
        if (providerId) {
          return reply(
            { content: null, tool_calls: [askProviderKey("call_2", providerId)] },
            "tool_calls",
          );
        }
      }
      const said = Object.entries(SAID_AFTER).find(([tool]) => calledTool(call, tool))?.[1];
      if (!said) return reply({ content: "ok" }, "stop");
      return reply({ content: null, tool_calls: [sendMessage("call_2", said)] }, "tool_calls");
    }
    const heard = textOf(last?.content);
    // Asked for a bot, the main bot makes one (decision 0060) and says so once it is made.
    if (/make a bot/i.test(heard) && !body.messages.some(madeABot)) {
      return reply({ content: null, tool_calls: [createBot("call_1")] }, "tool_calls");
    }
    // A bot just made is woken with a note from the app and says hello (decision 0063).
    if (heard.startsWith("[note] You were just created")) {
      return reply(
        { content: null, tool_calls: [sendMessage("call_1", "Hello, I am your new bot")] },
        "tool_calls",
      );
    }
    // Asked to ask a bot, the main bot tells the person it did, and writes to the first bot of its
    // list, by the handle its instructions give, as a model reads it (decision 0065).
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
    // A bot written to by the main bot writes back to it, after a while, so that the person can see
    // it at work (decision 0064); the main bot tells the person what it said.
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
    // Needing a decision, a bot asks the person with a card (decision 0066) and stops.
    if (/need a decision/i.test(heard)) {
      return reply({ content: null, tool_calls: [askQuestion("call_1")] }, "tool_calls");
    }
    // A round of a goal (decision 0068): the bot finishes the goal, and says so.
    if (heard.startsWith("[note] Goal round")) {
      if (body.messages.some((message) => calledTool(message, "update_goal"))) {
        return reply({ content: "ok" }, "stop");
      }
      return reply({ content: null, tool_calls: [completeGoal("call_1")] }, "tool_calls");
    }
    // Asked for a goal, a bot starts one and says it is on it; the rounds follow by themselves.
    if (
      /start a goal/i.test(heard) &&
      !body.messages.some((message) => calledTool(message, "start_goal"))
    ) {
      return reply({ content: null, tool_calls: [startGoal("call_1")] }, "tool_calls");
    }
    // Asked for something on a schedule, a bot sets it (decision 0067) and says so.
    if (
      /every morning/i.test(heard) &&
      !body.messages.some((message) => calledTool(message, "create_schedule"))
    ) {
      return reply({ content: null, tool_calls: [createSchedule("call_1")] }, "tool_calls");
    }
    // Asked about its skills, a bot names the first its instructions list (decision 0081).
    if (/your skills/i.test(heard)) {
      const everything = body.messages.map((message) => textOf(message.content)).join("\n");
      const skill = /Available skills:\n- ([a-z0-9-]+):/.exec(everything)?.[1];
      const said = skill ? `I have the ${skill} skill` : "I have no skills";
      return reply({ content: null, tool_calls: [sendMessage("call_1", said)] }, "tool_calls");
    }
    // Asked to connect an MCP server, a bot adds one (decision 0085) and says so.
    if (
      /connect .*mcp server/i.test(heard) &&
      !body.messages.some((message) => calledTool(message, "add_mcp_server"))
    ) {
      return reply({ content: null, tool_calls: [addMcpServer("call_1")] }, "tool_calls");
    }
    // Asked for a provider, a bot adds one with no key (decision 0086); its form comes next.
    if (
      /add .*provider/i.test(heard) &&
      !body.messages.some((message) => calledTool(message, "add_provider"))
    ) {
      return reply({ content: null, tool_calls: [addProvider("call_1")] }, "tool_calls");
    }
    // Told that the key is saved, it says the provider is ready.
    if (/saved the api key/i.test(heard)) {
      return reply(
        { content: null, tool_calls: [sendMessage("call_1", "Work Azure is ready")] },
        "tool_calls",
      );
    }
    // Asked to rename itself, any bot changes its own name and description.
    if (/call yourself/i.test(heard) && !body.messages.some(changedItself)) {
      return reply({ content: null, tool_calls: [updateSelf("call_1")] }, "tool_calls");
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
