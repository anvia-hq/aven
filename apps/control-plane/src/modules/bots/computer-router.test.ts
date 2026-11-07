import { afterAll, describe, expect, test } from "bun:test";

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("a bot's computer (real postgres, real WebSockets)", async () => {
  const { Elysia } = await import("elysia");
  const { db } = await import("@aven/db/client");
  const { WIRE_VERSION } = await import("@aven/protocol/runtime-wire");
  const { encodeViewerFrame } = await import("@aven/protocol/viewer-frame");
  const { errorsRouter } = await import("../../errors");
  const { createMemoryStore } = await import("../../memory-store");
  const { signUp } = await import("../../testing/sign-up");
  const { connectRouter } = await import("../runtimes/connect");
  const { RuntimeHub } = await import("../runtimes/hub");
  const { runtimesService } = await import("../runtimes/service");
  const { botComputerRouter } = await import("./computer-router");
  const { botsService } = await import("./service");
  type ControlPlaneToRuntime = import("@aven/protocol/runtime-wire").ControlPlaneToRuntime;

  const hub = new RuntimeHub(createMemoryStore(db));
  const owner = await signUp("bot-owner");
  const stranger = await signUp("bot-stranger");
  const { runtime, token } = await runtimesService.create(owner.organizationId, owner.userId, {
    name: "bots",
  });
  const server = new Elysia()
    .use(errorsRouter)
    .use(connectRouter(hub))
    .use(botComputerRouter(hub, runtime.id))
    .listen({ port: 0 });
  const base = `localhost:${server.server?.port}`;
  const sockets: WebSocket[] = [];
  const [mine] = await botsService.list(owner.userId);
  const [theirs] = await botsService.list(stranger.userId);

  afterAll(async () => {
    for (const socket of sockets) socket.close();
    await server.stop(true);
    await owner.remove();
    await stranger.remove();
  });

  const until = async (check: () => boolean, ms = 3000) => {
    const deadline = Date.now() + ms;
    while (!check()) {
      if (Date.now() > deadline) throw new Error("timed out");
      await Bun.sleep(20);
    }
  };

  const seen = { messages: [] as ControlPlaneToRuntime[] };
  const calls = () =>
    seen.messages.flatMap((message) => (message.type === "call" ? [message] : []));
  const connected = new Promise<void>((resolve) => {
    const init = { headers: { authorization: `Bearer ${token}` } };
    const ws = new WebSocket(`ws://${base}/connect`, init as unknown as string[]);
    ws.binaryType = "arraybuffer";
    sockets.push(ws);
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "hello", version: WIRE_VERSION }));
      resolve();
    };
    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) return;
      const message = JSON.parse(String(event.data)) as ControlPlaneToRuntime;
      seen.messages.push(message);
      if (message.type === "desktop.open") {
        ws.send(JSON.stringify({ type: "desktop.opened", viewerId: message.viewerId }));
        ws.send(encodeViewerFrame(message.viewerId, new TextEncoder().encode("RFB 003.008\n")));
      }
      if (message.type === "call") {
        let result: object = {
          held: message.method === "desktop.takeover",
          expiresAt: "2030-01-01T00:00:00Z",
        };
        if (message.method === "artifacts.read") {
          result = { mediaType: "image/png", data: "iVBORw0KGgo=" };
        } else if (message.method === "desktop.status" || message.method === "desktop.wake") {
          result = { state: "running", width: 1280, height: 800, control: { held: false } };
        }
        ws.send(JSON.stringify({ type: "reply", id: message.id, ok: true, result }));
      }
    };
  });
  await connected;
  await until(() => hub.isOnline(runtime.id));

  const api = (path: string, bearer: string | undefined, method = "GET") =>
    fetch(`http://${base}${path}`, {
      method,
      headers: bearer ? { authorization: `Bearer ${bearer}` } : {},
    });

  const open = (
    path: string,
    bearer: string | undefined,
    { headers = {} as Record<string, string>, protocols = [] as string[] } = {},
  ) => {
    const sent = { ...headers };
    if (bearer) sent.authorization = `Bearer ${bearer}`;
    const ws = new WebSocket(`ws://${base}${path}`, {
      headers: sent,
      protocols,
    } as unknown as string[]);
    ws.binaryType = "arraybuffer";
    sockets.push(ws);
    const events = {
      messages: [] as string[],
      closed: undefined as CloseEvent | undefined,
      failed: false,
      opened: false,
    };
    ws.onopen = () => (events.opened = true);
    ws.onmessage = (event) =>
      events.messages.push(new TextDecoder().decode(event.data as ArrayBuffer));
    ws.onclose = (event) => (events.closed = event);
    ws.onerror = () => (events.failed = true);
    return { ws, events };
  };

  test("a person sees, wakes, takes over and releases their bot's desktop", async () => {
    const status = await api(`/bots/${mine!.id}/desktop`, owner.token);
    expect(await status.json()).toMatchObject({ available: true, state: "running", held: false });

    const woken = await api(`/bots/${mine!.id}/desktop/wake`, owner.token, "POST");
    expect(woken.status).toBe(200);
    expect((await api(`/bots/${mine!.id}/desktop/takeover`, owner.token, "POST")).status).toBe(200);
    expect((await api(`/bots/${mine!.id}/desktop/release`, owner.token, "POST")).status).toBe(200);

    const asked = calls().filter((call) => call.method.startsWith("desktop."));
    expect(asked.map((call) => call.method)).toEqual([
      "desktop.status",
      "desktop.wake",
      "desktop.takeover",
      "desktop.release",
    ]);
    for (const call of asked) {
      expect(call.params).toMatchObject({ threadId: mine!.id, bot: true });
    }
    expect(asked[2]?.params).toMatchObject({ holder: owner.userId });
  });

  test("only the bot's own person: another person's bot is not found, and nothing is asked of the runner", async () => {
    const before = calls().length;

    for (const [path, method] of [
      ["desktop", "GET"],
      ["desktop/wake", "POST"],
      ["desktop/takeover", "POST"],
      ["desktop/release", "POST"],
    ] as const) {
      expect((await api(`/bots/${theirs!.id}/${path}`, owner.token, method)).status).toBe(404);
      expect((await api(`/bots/${mine!.id}/${path}`, undefined, method)).status).toBe(401);
    }

    expect(calls()).toHaveLength(before);
  });

  describe("the images sent to a bot (decision 0080)", () => {
    const name = `${crypto.randomUUID()}.png`;

    test("a person reads one, through the runner that keeps it", async () => {
      const image = await api(`/bots/${mine!.id}/artifacts/${name}`, owner.token);
      expect(image.status).toBe(200);
      expect(image.headers.get("content-type")).toBe("image/png");
      expect(image.headers.get("x-content-type-options")).toBe("nosniff");
      expect(new Uint8Array(await image.arrayBuffer())).toEqual(
        Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      );
      const asked = calls().filter((call) => call.method === "artifacts.read");
      expect(asked.at(-1)?.params).toMatchObject({ threadId: mine!.id, name, bot: true });
    });

    test("only the bot's own person: another person's bot is not found, and nothing is asked of the runner", async () => {
      const before = calls().length;
      expect((await api(`/bots/${theirs!.id}/artifacts/${name}`, owner.token)).status).toBe(404);
      expect((await api(`/bots/${mine!.id}/artifacts/${name}`, undefined)).status).toBe(401);
      expect((await api(`/bots/${mine!.id}/artifacts/..%2Fsecret.png`, owner.token)).status).toBe(
        422,
      );
      expect(calls()).toHaveLength(before);
    });
  });

  test("streams the desktop to the browser", async () => {
    const { ws, events } = open(`/bots/${mine!.id}/desktop/stream`, owner.token, {
      protocols: ["binary"],
    });

    await until(() => events.messages.length === 1);
    expect(ws.protocol).toBe("binary");
    expect(events.messages[0]).toBe("RFB 003.008\n");
    expect(
      seen.messages.find(
        (message) => message.type === "desktop.open" && message.threadId === mine!.id,
      ),
    ).toBeDefined();
    ws.close();
    await until(() => seen.messages.some((message) => message.type === "desktop.close"));
  });

  test("is refused for another person's bot, without a login and from another origin", async () => {
    const opens = () => seen.messages.filter((message) => message.type === "desktop.open").length;
    const before = opens();

    const others = open(`/bots/${theirs!.id}/desktop/stream`, owner.token, {
      protocols: ["binary"],
    });
    await until(() => others.events.failed || others.events.closed !== undefined);
    const anonymous = open(`/bots/${mine!.id}/desktop/stream`, undefined, {
      protocols: ["binary"],
    });
    await until(() => anonymous.events.failed || anonymous.events.closed !== undefined);
    const foreign = open(`/bots/${mine!.id}/desktop/stream`, owner.token, {
      headers: { origin: "https://evil.example" },
      protocols: ["binary"],
    });
    await until(() => foreign.events.failed || foreign.events.closed !== undefined);

    for (const refused of [others, anonymous, foreign]) expect(refused.events.opened).toBe(false);
    expect(opens()).toBe(before);
  });
});
