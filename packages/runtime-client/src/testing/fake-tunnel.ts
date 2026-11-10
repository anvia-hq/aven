import type { SandboxTunnel } from "@anvia/sandbox/remote";

export function fakeTunnel() {
  const stream = new TransformStream<Uint8Array, Uint8Array>();
  const writer = stream.writable.getWriter();
  const record = { opened: [] as number[], written: [] as Uint8Array[], closed: false };
  const tunnel: SandboxTunnel = {
    open: async (port) => {
      record.opened.push(port);
      return {
        port,
        write: async (data) => void record.written.push(new TextEncoder().encode(String(data))),
        output: stream.readable,
        close: () => {
          record.closed = true;
          writer.close().catch(() => undefined);
        },
        exit: new Promise<never>(() => undefined),
      };
    },
  };
  return {
    tunnel,
    record,
    push: (bytes: Uint8Array) => writer.write(bytes),
    end: () => writer.close(),
    fail: (reason: Error) => writer.abort(reason),
  };
}
