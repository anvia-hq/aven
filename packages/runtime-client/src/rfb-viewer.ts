import type { TunnelHandle } from "@anvia/sandbox/remote";

import { ByteQueue } from "./byte-queue";
import { RfbLink, rfbLogin } from "./rfb";
import type { VncEndpoint } from "./types";

type Exit = Awaited<TunnelHandle["exit"]>;

const NONE_ONLY = Buffer.from([1, 1]);
const SECURITY_OK = Buffer.alloc(4);

class Outbox implements AsyncIterable<Uint8Array> {
  #chunks: Uint8Array[] = [];
  #waiter: (() => void) | undefined;
  #done = false;

  push(chunk: Uint8Array) {
    if (this.#done) return;
    this.#chunks.push(chunk);
    this.#wake();
  }

  end() {
    this.#done = true;
    this.#wake();
  }

  #wake() {
    const waiter = this.#waiter;
    this.#waiter = undefined;
    waiter?.();
  }

  async *[Symbol.asyncIterator]() {
    for (;;) {
      const chunk = this.#chunks.shift();
      if (chunk) yield chunk;
      else if (this.#done) return;
      else {
        await new Promise<void>((resolve) => {
          this.#waiter = resolve;
        });
      }
    }
  }
}

export async function openVncViewer(endpoint: VncEndpoint): Promise<TunnelHandle> {
  const upstream = await RfbLink.open(endpoint);
  try {
    await rfbLogin(upstream, endpoint.password);
  } catch (error) {
    upstream.close();
    throw error;
  }
  const input = new ByteQueue();
  const output = new Outbox();
  let ended = false;
  let finish: (exit: Exit) => void = () => undefined;
  const exit = new Promise<Exit>((resolve) => {
    finish = resolve;
  });
  const end = (reason: Exit["reason"], message?: string) => {
    if (ended) return;
    ended = true;
    output.end();
    upstream.close();
    input.end();
    finish(message === undefined ? { reason } : { reason, message });
  };

  const serve = async () => {
    output.push(Buffer.from("RFB 003.008\n"));
    await input.take(12);
    output.push(NONE_ONLY);
    await input.take(1);
    output.push(SECURITY_OK);
    const toBrowser = (async () => {
      for (;;) output.push(await upstream.queue.takeSome());
    })();
    const toDesktop = (async () => {
      for (;;) upstream.write(await input.takeSome());
    })();
    await Promise.race([toBrowser, toDesktop]);
  };
  serve().catch((error: unknown) => {
    if (ended) return;
    const closed = error instanceof Error && error.message === "The connection closed";
    end(closed ? "remote" : "error", closed ? undefined : String(error));
  });

  return {
    port: endpoint.port,
    output,
    exit,
    async write(data) {
      if (ended) throw new Error("The desktop connection ended");
      input.push(typeof data === "string" ? new TextEncoder().encode(data) : data);
    },
    close() {
      end("closed");
    },
  };
}
