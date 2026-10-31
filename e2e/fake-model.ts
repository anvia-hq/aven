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

const sendMessage = (id: string, text: string) => ({
  id,
  type: "function",
  function: { name: "send_message", arguments: JSON.stringify({ text }) },
});

Bun.serve({
  port: modelPort,
  async fetch(request) {
    const { pathname } = new URL(request.url);
    if (pathname === "/health") return new Response("ok");
    if (!pathname.endsWith("/chat/completions")) return new Response("not found", { status: 404 });

    const body = (await request.json()) as { messages: ChatMessage[]; stream?: boolean };
    if (body.stream) return new Response("the fake model does not stream", { status: 400 });

    const last = body.messages.at(-1);
    if (last?.role === "tool") return reply({ content: "ok" }, "stop");
    const heard = textOf(last?.content);
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
