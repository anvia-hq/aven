import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import type { IncomingMessage } from "node:http";

import type { PinnedTarget } from "../tools/types";

function bodyOf(incoming: IncomingMessage) {
  const chunks = incoming[Symbol.asyncIterator]();

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await chunks.next();

      if (done) controller.close();
      else controller.enqueue(new Uint8Array(value));
    },
    cancel() {
      incoming.destroy();
    },
  });
}

export function pinnedRequest(target: PinnedTarget, signal: AbortSignal): Promise<Response> {
  const { url, address } = target;
  const family = isIP(address);
  const send = url.protocol === "https:" ? httpsRequest : httpRequest;

  return new Promise((resolve, reject) => {
    const outgoing = send(
      url,
      {
        method: "GET",
        signal,
        headers: {
          accept: "text/html,text/plain,application/json,*/*;q=0.5",
          "user-agent": "aven",
        },
        lookup: (_host, lookupOptions, callback) => {
          if (lookupOptions.all) callback(null, [{ address, family }], undefined);
          else callback(null, address, family);
        },
      },
      (incoming) => {
        const headers = new Headers();

        for (const [name, value] of Object.entries(incoming.headers)) {
          for (const entry of Array.isArray(value) ? value : [value]) {
            if (entry !== undefined) headers.append(name, entry);
          }
        }

        const status = incoming.statusCode ?? 502;
        const empty = status === 204 || status === 205 || status === 304;
        const body = empty ? null : bodyOf(incoming);

        resolve(new Response(body, { status, headers }));
      },
    );

    outgoing.on("error", reject);
    outgoing.end();
  });
}
