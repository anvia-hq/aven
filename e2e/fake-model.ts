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

const updateSelf = (id: string) => ({
  id,
  type: "function",
  function: {
    name: "update_self",
    arguments: JSON.stringify({ name: "Pip", description: "Keeps you company." }),
  },
});

// What the bot says once the tool it called has answered.
const SAID_AFTER: Record<string, string> = {
  create_bot: "Scout is ready",
  update_self: "I am Pip now",
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
