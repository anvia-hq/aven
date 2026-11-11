import { afterAll, describe, expect, test } from "bun:test";

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("a bot's computer (real postgres, real WebSockets)", async () => {
  const { Elysia } = await import("elysia");
  const { db } = await import("@aven/db/client");
  const { WIRE_VERSION } = await import("@aven/protocol/runtime-wire");
  const { errorsRouter } = await import("../../errors");
  const { createMemoryStore } = await import("../../memory-store");
  const { signUp } = await import("../../testing/sign-up");
  const { connectRouter } = await import("../runtimes/connect");
  const { RuntimeHub } = await import("../runtimes/hub");
  const { runtimesService } = await import("../runtimes/service");
  const { botComputerRouter } = await import("./computer-router");
  const { botsService } = await import("./service");
  type ControlPlaneToRuntime = import("@aven/protocol/types").ControlPlaneToRuntime;

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
      if (message.type === "call") {
        let result: object = {};
        if (message.method === "artifacts.read") {
          result = { mediaType: "image/png", data: "iVBORw0KGgo=" };
        } else if (message.method === "computer.status" || message.method === "computer.wake") {
          result = { state: "awake" };
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

  test("a person sees and wakes their bot's computer", async () => {
    const status = await api(`/bots/${mine!.id}/computer`, owner.token);
    expect(await status.json()).toMatchObject({ available: true, state: "awake" });

    const woken = await api(`/bots/${mine!.id}/computer/wake`, owner.token, "POST");
    expect(woken.status).toBe(200);

    const asked = calls().filter((call) => call.method.startsWith("computer."));
    expect(asked.map((call) => call.method)).toEqual(["computer.status", "computer.wake"]);
    for (const call of asked) {
      expect(call.params).toMatchObject({ threadId: mine!.id, bot: true });
    }
  });

  test("only the bot's own person: another person's bot is not found, and nothing is asked of the runner", async () => {
    const before = calls().length;

    for (const [path, method] of [
      ["computer", "GET"],
      ["computer/wake", "POST"],
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
});
