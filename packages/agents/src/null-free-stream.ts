// Some servers behind the chat completions API send `null` for fields a chunk does not set
// (`"id": null, "name": null` on every continuation of a streamed tool call, as Azure does for
// DeepSeek). The Anvia SDK accepts a missing field but rejects a null one as an invalid tool call
// (docs/bugs/0002-chat-stream-null-tool-call-fields.md). This wraps `fetch` so the event stream it
// returns carries no null properties.

function withoutNulls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutNulls);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, field]) => field !== null)
      .map(([key, field]) => [key, withoutNulls(field)]),
  );
}

// One server-sent line: a JSON `data:` line is cleaned, anything else passes through.
function cleanLine(line: string) {
  const match = /^data: ?(.*)$/.exec(line);
  if (!match || match[1] === "[DONE]") return line;
  try {
    return `data: ${JSON.stringify(withoutNulls(JSON.parse(match[1] ?? "")))}`;
  } catch {
    return line;
  }
}

function cleanStream(body: ReadableStream<Uint8Array>) {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let pending = "";
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        pending += decoder.decode(chunk, { stream: true });
        const lines = pending.split("\n");
        pending = lines.pop() ?? "";
        if (lines.length > 0)
          controller.enqueue(encoder.encode(`${lines.map(cleanLine).join("\n")}\n`));
      },
      flush(controller) {
        const rest = pending + decoder.decode();
        if (rest) controller.enqueue(encoder.encode(cleanLine(rest)));
      },
    }),
  );
}

type Fetch = (
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
) => Promise<Response>;

export function nullFreeStream(base: Fetch = fetch): typeof fetch {
  return Object.assign(
    async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const response = await base(input, init);
      if (!response.body || !response.headers.get("content-type")?.includes("text/event-stream")) {
        return response;
      }
      return new Response(cleanStream(response.body), {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    },
    fetch,
  );
}
