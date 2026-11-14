import { afterAll, describe, expect, test } from "bun:test";

import { decodeViewerFrame, encodeViewerFrame } from "@aven/protocol/viewer-frame";

import { threadsService } from "../threads/service";
import { runnerRig } from "../../testing/runner-rig";
import { terminalRouter } from "./router";
import type { ControlPlaneToRuntime } from "@aven/protocol/types";

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("a thread's terminal (real postgres, real WebSockets)", async () => {
  const rig = await runnerRig(terminalRouter);
  const { base, owner, outsider, until } = rig;
  afterAll(() => rig.stop());

  async function setup() {
    const seen = { messages: [] as ControlPlaneToRuntime[] };
    const { thread } = await rig.threadOnRunner((event, runner) => {
      if (event.data instanceof ArrayBuffer) {
        const frame = decodeViewerFrame(new Uint8Array(event.data));

        if (!frame) return;

        const typed = new TextDecoder().decode(frame.payload).toUpperCase();
        runner.send(encodeViewerFrame(frame.viewerId, new TextEncoder().encode(typed)));
        return;
      }

      const message = JSON.parse(String(event.data)) as ControlPlaneToRuntime;
      seen.messages.push(message);

      if (message.type === "terminal.open") {
        runner.send(JSON.stringify({ type: "terminal.opened", viewerId: message.viewerId }));
      }
    });
    return { thread, seen };
  }

  function view(
    threadId: string,
    token: string | undefined,
    { query = "cols=100&rows=30", headers = {} as Record<string, string> } = {},
  ) {
    const sent = { ...headers };

    if (token) sent.authorization = `Bearer ${token}`;

    const ws = new WebSocket(`ws://${base}/threads/${threadId}/terminal/stream?${query}`, {
      headers: sent,
    } as unknown as string[]);
    ws.binaryType = "arraybuffer";
    rig.track(ws);
    const events = {
      messages: [] as string[],
      closed: undefined as CloseEvent | undefined,
      failed: false,
    };
    ws.onmessage = (event) =>
      events.messages.push(new TextDecoder().decode(event.data as ArrayBuffer));
    ws.onclose = (event) => (events.closed = event);
    ws.onerror = () => (events.failed = true);
    return { ws, events };
  }

  test("opens a shell of the asked size, carries keystrokes and output, resizes and closes it", async () => {
    const { thread, seen } = await setup();
    const { ws, events } = view(thread.id, owner.token);

    await until(() => seen.messages.some((message) => message.type === "terminal.open"));
    expect(seen.messages.find((message) => message.type === "terminal.open")).toMatchObject({
      threadId: thread.id,
      cols: 100,
      rows: 30,
    });

    ws.send(new TextEncoder().encode("ls\n"));
    await until(() => events.messages.length === 1);
    expect(events.messages[0]).toBe("LS\n");

    ws.send(JSON.stringify({ type: "resize", cols: 80, rows: 24 }));
    await until(() => seen.messages.some((message) => message.type === "terminal.resize"));
    expect(seen.messages.find((message) => message.type === "terminal.resize")).toMatchObject({
      cols: 80,
      rows: 24,
    });

    ws.close();
    await until(() => seen.messages.some((message) => message.type === "terminal.close"));
  });

  test("a size that is not a size is refused", async () => {
    const { thread, seen } = await setup();
    const opened = () => seen.messages.filter((message) => message.type === "terminal.open");
    const { events } = view(thread.id, owner.token, { query: "cols=0&rows=30" });
    await until(() => events.failed || events.closed !== undefined);
    const { events: huge } = view(thread.id, owner.token, { query: "cols=99999&rows=30" });
    await until(() => huge.failed || huge.closed !== undefined);
    expect(opened()).toEqual([]);

    const sized = view(thread.id, owner.token, { query: "cols=99&rows=30" });
    await until(() => opened().length > 0);
    expect(opened()).toEqual([expect.objectContaining({ cols: 99, rows: 30 })]);
    sized.ws.close();
  });

  test("is refused without a login, from another origin, and for another organization's thread", async () => {
    const { thread, seen } = await setup();
    const anonymous = view(thread.id, undefined);
    await until(() => anonymous.events.failed || anonymous.events.closed !== undefined);

    const foreign = view(thread.id, owner.token, { headers: { origin: "https://evil.example" } });
    await until(() => foreign.events.failed || foreign.events.closed !== undefined);

    const stranger = view(thread.id, outsider.token);
    await until(() => stranger.events.failed || stranger.events.closed !== undefined);

    expect(seen.messages.some((message) => message.type === "terminal.open")).toBe(false);
  });

  test("is for the person the thread last ran as, and the creator before any run", async () => {
    const { thread, seen } = await setup();
    await threadsService.markRunBy(thread.id, outsider.userId);

    const creator = view(thread.id, owner.token);
    await until(() => creator.events.failed || creator.events.closed !== undefined);
    expect(seen.messages.some((message) => message.type === "terminal.open")).toBe(false);

    await threadsService.markRunBy(thread.id, owner.userId);
    const again = view(thread.id, owner.token);
    await until(() => seen.messages.some((message) => message.type === "terminal.open"));
    again.ws.close();
  });
});
