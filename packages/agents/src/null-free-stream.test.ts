import { describe, expect, test } from "bun:test";

import { nullFreeStream } from "./null-free-stream";

const sse = (...lines: string[]) =>
  new Response(lines.join("\n"), { headers: { "content-type": "text/event-stream" } });

describe("nullFreeStream", () => {
  test("drops null properties from every event, however the bytes are split", async () => {
    const chunk = {
      choices: [
        {
          delta: {
            content: null,
            tool_calls: [{ id: null, index: 0, function: { name: null, arguments: '{"a":null}' } }],
          },
          finish_reason: null,
        },
      ],
      usage: null,
    };
    const body = `data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`;
    const bytes = new TextEncoder().encode(body);
    const split = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let at = 0; at < bytes.length; at += 7) controller.enqueue(bytes.slice(at, at + 7));
        controller.close();
      },
    });
    const wrapped = nullFreeStream(
      async () => new Response(split, { headers: { "content-type": "text/event-stream" } }),
    );
    const text = await (await wrapped("https://x.test")).text();
    const [first, , done] = text.split("\n");
    expect(JSON.parse(first!.slice("data: ".length))).toEqual({
      choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{"a":null}' } }] } }],
    });
    expect(done).toBe("data: [DONE]");
  });

  test("leaves other responses and non-JSON lines as they are", async () => {
    const json = Response.json({ id: null });
    const same = await nullFreeStream(async () => json)("https://x.test");
    expect(await same.json()).toEqual({ id: null });
    const text = await (
      await nullFreeStream(async () => sse(": keep-alive", "data: not json", ""))("https://x.test")
    ).text();
    expect(text).toBe(": keep-alive\ndata: not json\n");
  });
});
