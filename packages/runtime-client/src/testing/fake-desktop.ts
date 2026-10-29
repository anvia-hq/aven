import type { SandboxDesktop } from "@anvia/sandbox";

// FOR TESTS ONLY.
// A desktop whose VNC stream the test controls. Only what the viewers use is there, so it is cast.
export function fakeDesktop() {
  const stream = new TransformStream<Uint8Array, Uint8Array>();
  const writer = stream.writable.getWriter();
  const record = { written: [] as Uint8Array[], closed: false, takeovers: [] as unknown[] };
  const tunnel = {
    port: 5900,
    write: async (data: Uint8Array) => void record.written.push(data),
    output: stream.readable,
    close: () => {
      record.closed = true;
      writer.close().catch(() => undefined);
    },
    exit: new Promise<never>(() => undefined),
  };
  const desktop = {
    openViewer: async () => tunnel,
    status: async () => ({
      state: "running" as const,
      width: 1280,
      height: 800,
      maxWidth: 3840,
      maxHeight: 2160,
      display: ":99",
      vncPort: 5900,
      restarts: 0,
      control: { held: false },
    }),
    takeover: async (options: unknown) => {
      record.takeovers.push(options);
      return { held: true, holder: "me" };
    },
    release: async (options: unknown) => {
      record.takeovers.push(options);
      return { held: false };
    },
  } as unknown as SandboxDesktop;
  return {
    desktop,
    record,
    push: (bytes: Uint8Array) => writer.write(bytes),
    end: () => writer.close(),
  };
}
