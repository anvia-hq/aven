const agentModelPort = Number(process.env.AGENT_MODEL_PORT ?? 8212);

const sse = (events: [string, unknown][]) =>
  events.map(([name, data]) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`).join("");

const opening = {
  type: "message_start",
  message: {
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-5",
    content: [],
    stop_reason: null,
    usage: { input_tokens: 10, output_tokens: 1 },
  },
};

const tool = (name: string, input: unknown) =>
  sse([
    ["message_start", opening],
    [
      "content_block_start",
      {
        type: "content_block_start",
        index: 0,
        content_block: {
          type: "tool_use",
          id: `toolu_${crypto.randomUUID().slice(0, 8)}`,
          name,
          input: {},
        },
      },
    ],
    [
      "content_block_delta",
      {
        type: "content_block_delta",
        index: 0,
        delta: { type: "input_json_delta", partial_json: JSON.stringify(input) },
      },
    ],
    ["content_block_stop", { type: "content_block_stop", index: 0 }],
    [
      "message_delta",
      {
        type: "message_delta",
        delta: { stop_reason: "tool_use", stop_sequence: null },
        usage: { output_tokens: 5 },
      },
    ],
    ["message_stop", { type: "message_stop" }],
  ]);

const answer = (text: string) =>
  sse([
    ["message_start", opening],
    [
      "content_block_start",
      { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    ],
    [
      "content_block_delta",
      { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } },
    ],
    ["content_block_stop", { type: "content_block_stop", index: 0 }],
    [
      "message_delta",
      {
        type: "message_delta",
        delta: { stop_reason: "end_turn", stop_sequence: null },
        usage: { output_tokens: 5 },
      },
    ],
    ["message_stop", { type: "message_stop" }],
  ]);

const hasToolResult = (body: string) => {
  const content = JSON.parse(body).messages?.at(-1)?.content;
  return (
    Array.isArray(content) && content.some((part: { type?: string }) => part.type === "tool_result")
  );
};

Bun.serve({
  port: agentModelPort,
  async fetch(request) {
    const { pathname } = new URL(request.url);

    if (pathname === "/health") return new Response("ok");

    if (!pathname.endsWith("/v1/messages")) return new Response("not found", { status: 404 });

    const body = await request.text();
    const reply = hasToolResult(body)
      ? answer("Wrote proof.txt on the computer.")
      : tool("exec_command", { command: "echo made > proof.txt" });
    return new Response(reply, { headers: { "content-type": "text/event-stream" } });
  },
});

console.log(`agent model listening on ${agentModelPort}`);
