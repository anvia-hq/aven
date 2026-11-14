import { afterAll, describe, expect, test } from "bun:test";
import { Elysia } from "elysia";

import { db } from "@aven/db/client";
import { WIRE_VERSION } from "@aven/protocol/runtime-wire";

import { errorsRouter } from "@aven/server-kit/errors";
import { createMemoryStore } from "../../memory-store";
import { seedOrgPair } from "../../testing/seed-org-pair";
import { signUp } from "../../testing/sign-up";
import { runtimesRouter } from "./router";
import type { LatestRelease } from "./types";
import { connectRouter } from "./connect";
import { RuntimeHub } from "./hub";
import { threadCockpit } from "../cockpit/commands";
import { LOCAL_RUNTIME_ID, runtimesService } from "./service";
import type { ControlPlaneToRuntime } from "@aven/protocol/types";

const noReleases: LatestRelease = { get: async () => undefined };

const run = process.env.DATABASE_URL ? describe : describe.skip;

const SKILL_DIGEST = "a".repeat(64);
const SKILL_ARCHIVE = new Uint8Array([1, 2, 3]);

run("runtime connection (real postgres, real WebSocket)", async () => {
  const seed = await seedOrgPair();
  const store = createMemoryStore(db);
  const cloned: string[] = [];
  const repoAccess = {
    cloneUrl: "https://github.com/acme/web.git",
    defaultBranch: "main",
    token: "t",
  };
  const GRACE_MS = 400;
  const reported: { id: string; error?: string }[] = [];
  const hub = new RuntimeHub(
    store,
    async (threadId) => {
      cloned.push(threadId);
      return repoAccess;
    },
    GRACE_MS,
    async (digest) => (digest === SKILL_DIGEST ? SKILL_ARCHIVE : undefined),
    async (results) => {
      reported.push(...results);
    },
  );
  const server = new Elysia().use(connectRouter(hub)).listen({ port: 0 });
  const full = new Elysia()
    .use(errorsRouter)
    .use(runtimesRouter(hub, noReleases))
    .listen({ port: 0 });
  const owner = await signUp("owner");
  const outsider = await signUp("outsider");
  const sockets: WebSocket[] = [];
  const threadIds: string[] = [];

  afterAll(async () => {
    for (const socket of sockets) socket.close();
    await server.stop(true);
    await full.stop(true);
    for (const id of threadIds) {
      await store.clear({
        scope: { sessionId: id, metadata: { organizationId: seed.orgA } },
      });
    }
    await seed.cleanup();
    await owner.remove();
    await outsider.remove();
  });

  const open = (
    port: number | undefined,
    token: string,
    path = "/connect",
    version: number | null = WIRE_VERSION,
    runs: string[] = [],
  ) =>
    new Promise<WebSocket>((resolve, reject) => {
      const init = { headers: { authorization: `Bearer ${token}` } };
      const ws = new WebSocket(`ws://localhost:${port}${path}`, init as unknown as string[]);
      sockets.push(ws);
      ws.onopen = () => {
        if (version !== null) ws.send(JSON.stringify({ type: "hello", version, runs }));

        resolve(ws);
      };
      ws.onerror = () => reject(new Error("connect failed"));
    });

  const until = async (check: () => boolean, ms = 3000) => {
    const deadline = Date.now() + ms;
    while (!check()) {
      if (Date.now() > deadline) throw new Error("timed out");

      await Bun.sleep(20);
    }
  };

  const inbox = (ws: WebSocket) => {
    const received: ControlPlaneToRuntime[] = [];
    ws.onmessage = (event) => {
      if (typeof event.data === "string") received.push(JSON.parse(event.data));
    };
    return received;
  };

  const ask = (
    ws: WebSocket,
    received: ControlPlaneToRuntime[],
    method: string,
    params: unknown,
  ) => {
    const id = crypto.randomUUID();
    ws.send(JSON.stringify({ type: "call", id, method, params }));
    return until(() => received.some((m) => m.type === "reply" && m.id === id)).then(
      () =>
        received.find((m) => m.type === "reply" && m.id === id) as Extract<
          ControlPlaneToRuntime,
          { type: "reply" }
        >,
    );
  };

  test("a missing, wrong or revoked token never connects", async () => {
    await expect(open(server.server?.port, "")).rejects.toThrow();
    await expect(open(server.server?.port, "avrt_nope")).rejects.toThrow();
    const { runtime, token } = await runtimesService.create(seed.orgA, seed.userId, { name: "r" });
    await runtimesService.revoke(seed.orgA, seed.userId, runtime.id);
    await expect(open(server.server?.port, token)).rejects.toThrow();
  });

  test("is mounted at /runtimes/connect and shows online", async () => {
    const { runtime, token } = await runtimesService.create(seed.orgA, seed.userId, { name: "r" });
    await open(full.server?.port, token, "/runtimes/connect");
    await until(() => hub.isOnline(runtime.id));
  });

  test("repository access is only given for a live run, and for that run's own thread", async () => {
    const { runtime, token } = await runtimesService.create(seed.orgA, seed.userId, { name: "g" });
    const ws = await open(server.server?.port, token);
    const received = inbox(ws);
    await until(() => hub.isOnline(runtime.id));
    const connection = hub.get(runtime.id)!;
    const thread = { id: crypto.randomUUID(), organizationId: seed.orgA };
    connection.startRun("run-git", thread, {
      event: () => undefined,
      end: () => undefined,
      lost: () => undefined,
    });

    const unknown = await ask(ws, received, "repo.access", { runId: "someone-elses" });
    expect(unknown.ok).toBe(false);
    expect(cloned).toEqual([]);

    const given = await ask(ws, received, "repo.access", { runId: "run-git", threadId: "other" });
    expect(given).toMatchObject({ ok: true, result: repoAccess });
    expect(cloned).toEqual([thread.id]);

    connection.endRun("run-git");
    expect((await ask(ws, received, "repo.access", { runId: "run-git" })).ok).toBe(false);
  });

  test("a run reaches the machine its thread names, for that thread only, and an offline one is said so", async () => {
    const { runtime, token } = await runtimesService.create(seed.orgA, seed.userId, { name: "m" });
    const ws = await open(server.server?.port, token);
    const received = inbox(ws);
    await until(() => hub.isOnline(runtime.id));
    const connection = hub.get(runtime.id)!;
    const machine = crypto.randomUUID();
    const reached: unknown[] = [];
    const sent: unknown[] = [];
    hub.machines = {
      reach: async (place) => {
        reached.push(place);

        if (place.runtimeId !== machine) throw new Error("The computer is offline");

        return {
          call: async (method, params, timeoutMs) => {
            sent.push({ method, params, timeoutMs });
            const op = (params as { op?: string } | undefined)?.op;

            if (op === "paths") throw new Error("Unknown call machine.call");

            if (op === "workspace") throw new Error("unknown call");

            if (op === "listFiles") throw new Error("Could not list files");

            return { path: "/home/aven/workspaces/t" };
          },
        };
      },
    };
    const sink = { event: () => undefined, end: () => undefined, lost: () => undefined };
    const onMachine = { id: crypto.randomUUID(), organizationId: seed.orgA, machine };
    const onItsRunner = { id: crypto.randomUUID(), organizationId: seed.orgA };
    const elsewhere = { ...onMachine, id: crypto.randomUUID(), machine: crypto.randomUUID() };
    connection.startRun("run-machine", onMachine, sink);
    connection.startRun("run-own", onItsRunner, sink);
    connection.startRun("run-away", elsewhere, sink);

    const answered = await ask(ws, received, "machine.call", {
      runId: "run-machine",
      threadId: "someone-elses",
      op: "exec",
      args: { command: "ls", timeoutMs: 1000 },
    });
    expect(answered).toMatchObject({ ok: true, result: { path: "/home/aven/workspaces/t" } });
    expect(reached).toEqual([{ runtimeId: machine, threadId: onMachine.id }]);
    expect(sent).toEqual([
      {
        method: "machine.call",
        params: { threadId: onMachine.id, op: "exec", args: { command: "ls", timeoutMs: 1000 } },
        timeoutMs: 31_000,
      },
    ]);

    const own = await ask(ws, received, "machine.call", { runId: "run-own", op: "workspace" });
    expect(own).toMatchObject({ ok: false, error: "This run's tools act on its own runner" });
    const offline = await ask(ws, received, "machine.call", { runId: "run-away", op: "workspace" });
    expect(offline).toMatchObject({ ok: false, error: "The computer is offline" });
    const unknownOp = await ask(ws, received, "machine.call", { runId: "run-machine", op: "rm" });
    expect(unknownOp.ok).toBe(false);
    expect(sent).toHaveLength(1);

    const stale = await ask(ws, received, "machine.call", { runId: "run-machine", op: "paths" });
    expect(stale).toMatchObject({
      ok: false,
      error: "Update this computer's runner to use its tools",
    });
    const lowercase = await ask(ws, received, "machine.call", {
      runId: "run-machine",
      op: "workspace",
    });
    expect(lowercase).toMatchObject({
      ok: false,
      error: "Update this computer's runner to use its tools",
    });
    const other = await ask(ws, received, "machine.call", {
      runId: "run-machine",
      op: "listFiles",
    });
    expect(other).toMatchObject({ ok: false, error: "Could not list files" });

    const servers = [
      { id: crypto.randomUUID(), name: "Notes", url: "http://x/mcp", allowLocal: true },
    ];
    for (const op of ["mcp.connect", "mcp.call", "mcp.close"]) {
      const relayed = await ask(ws, received, "machine.call", {
        runId: "run-machine",
        op,
        args: { servers },
      });
      expect(relayed).toMatchObject({ ok: true });
      expect(sent.at(-1)).toMatchObject({
        method: "machine.call",
        params: { threadId: onMachine.id, op, args: { servers } },
      });
    }
  });

  test("a stop reaches the machine while its command is still running", async () => {
    const { runtime, token } = await runtimesService.create(seed.orgA, seed.userId, { name: "m" });
    const ws = await open(server.server?.port, token);
    const received = inbox(ws);
    await until(() => hub.isOnline(runtime.id));
    const connection = hub.get(runtime.id)!;
    const machine = crypto.randomUUID();
    const sent: string[] = [];
    let releaseExec: (() => void) | undefined;
    hub.machines = {
      reach: async (place) => {
        if (place.runtimeId !== machine) throw new Error("The computer is offline");

        return {
          call: async (_method, params) => {
            const op = (params as { op?: string }).op ?? "";
            sent.push(op);

            if (op === "exec") await new Promise<void>((resolve) => (releaseExec = resolve));

            return null;
          },
        };
      },
    };
    connection.startRun(
      "run-stop",
      { id: crypto.randomUUID(), organizationId: seed.orgA, machine },
      { event: () => undefined, end: () => undefined, lost: () => undefined },
    );

    const exec = ask(ws, received, "machine.call", {
      runId: "run-stop",
      op: "exec",
      args: { command: "sleep 30", operationId: "cmd-1" },
    });
    await until(() => sent.includes("exec"));
    const abort = ask(ws, received, "machine.call", {
      runId: "run-stop",
      op: "exec.abort",
      args: { operationId: "cmd-1" },
    });
    await until(() => sent.includes("exec.abort"));
    expect(sent).toEqual(["exec", "exec.abort"]);
    releaseExec?.();

    expect(await abort).toMatchObject({ ok: true, result: null });
    expect(await exec).toMatchObject({ ok: true, result: null });
  });

  test("a runtime fetches only the skills of its own runs", async () => {
    const { runtime, token } = await runtimesService.create(seed.orgA, seed.userId, { name: "s" });
    const ws = await open(server.server?.port, token);
    const received = inbox(ws);
    await until(() => hub.isOnline(runtime.id));
    const connection = hub.get(runtime.id)!;
    const thread = { id: crypto.randomUUID(), organizationId: seed.orgA };
    const sink = { event: () => undefined, end: () => undefined, lost: () => undefined };
    connection.startRun("run-with", thread, sink, [SKILL_DIGEST]);
    connection.startRun("run-without", thread, sink);

    const given = await ask(ws, received, "skills.get", {
      runId: "run-with",
      digest: SKILL_DIGEST,
    });
    expect(given).toMatchObject({ ok: true, result: { data: SKILL_ARCHIVE.toBase64() } });
    const other = await ask(ws, received, "skills.get", {
      runId: "run-without",
      digest: SKILL_DIGEST,
    });
    expect(other.ok).toBe(false);
    expect((await ask(ws, received, "skills.get", { runId: "run-with", digest: "x" })).ok).toBe(
      false,
    );
  });

  test("a thread run's cockpit is its sender's to read, and a write through it is refused", async () => {
    const { runtime, token } = await runtimesService.create(seed.orgA, seed.userId, { name: "c" });
    const ws = await open(server.server?.port, token);
    const received = inbox(ws);
    await until(() => hub.isOnline(runtime.id));
    const connection = hub.get(runtime.id)!;
    const thread = { id: crypto.randomUUID(), organizationId: seed.orgA };
    const sink = { event: () => undefined, end: () => undefined, lost: () => undefined };
    connection.startRun("run-read", thread, sink, [], [], undefined, threadCockpit(seed.userId));
    connection.startRun("run-no-cockpit", thread, sink);

    const listed = await ask(ws, received, "cockpit.read", {
      runId: "run-read",
      command: { command: "list", kind: "notes" },
    });
    expect(listed).toMatchObject({ ok: true });
    const write = await ask(ws, received, "cockpit.read", {
      runId: "run-read",
      command: { command: "create", kind: "notes", fields: { title: "Planted" } },
    });
    expect(write).toMatchObject({ ok: false });
    expect(JSON.stringify(write)).toContain("only read");
    const none = await ask(ws, received, "cockpit.read", {
      runId: "run-no-cockpit",
      command: { command: "list", kind: "notes" },
    });
    expect(none).toMatchObject({ ok: false });
  });

  test("a runtime reports only on the MCP servers of its own runs", async () => {
    const { runtime, token } = await runtimesService.create(seed.orgA, seed.userId, { name: "m" });
    const ws = await open(server.server?.port, token);
    const received = inbox(ws);
    await until(() => hub.isOnline(runtime.id));
    const connection = hub.get(runtime.id)!;
    const thread = { id: crypto.randomUUID(), organizationId: seed.orgA };
    const sink = { event: () => undefined, end: () => undefined, lost: () => undefined };
    const given = crypto.randomUUID();
    const notGiven = crypto.randomUUID();
    connection.startRun("run-mcp", thread, sink, [], [given]);
    connection.startRun("run-no-mcp", thread, sink);
    reported.length = 0;

    const results = [{ id: given, error: "connection refused" }, { id: notGiven }];
    const answered = await ask(ws, received, "mcp.report", { runId: "run-mcp", results });
    expect(answered).toMatchObject({ ok: true, result: null });
    expect(reported).toEqual([{ id: given, error: "connection refused" }]);

    reported.length = 0;
    await ask(ws, received, "mcp.report", { runId: "run-no-mcp", results });
    expect(reported).toEqual([]);
    expect((await ask(ws, received, "mcp.report", { runId: "run-mcp", results: "x" })).ok).toBe(
      false,
    );
    expect(
      (await ask(ws, received, "mcp.report", { runId: "run-mcp", results: [{ id: "nope" }] })).ok,
    ).toBe(false);
  });

  describe("a bot's reply", () => {
    const model = { provider: "openai", gatewayPath: "/g", gatewayToken: "t" } as const;
    const info = {
      id: "bot-1",
      name: "Pip",
      handle: "pip",
      instruction: "",
      description: "",
      canCreateBots: false,
      peers: [],
      timezone: "UTC",
    };

    const replying = async (
      name: string,
      answerMemory = async (): Promise<unknown> => null,
      machine?: string,
    ) => {
      const { runtime, token } = await runtimesService.create(seed.orgA, seed.userId, { name });
      const ws = await open(server.server?.port, token);
      const received = inbox(ws);
      await until(() => hub.isOnline(runtime.id));
      const connection = hub.get(runtime.id)!;
      const heard = {
        said: [] as string[],
        activity: [] as (string | null)[],
        ended: [] as (string | undefined)[],
        lost: [] as Error[],
      };
      const asked: unknown[] = [];
      connection.startBotReply(
        "reply-1",
        { bot: info, prompt: "hi", model, machine },
        {
          say: (text) => heard.said.push(text),
          activity: (label) => heard.activity.push(label),
          end: (error) => heard.ended.push(error),
          lost: (error) => heard.lost.push(error),
          memory: async (params) => (asked.push(params), answerMemory()),
          create: async (params) => (
            asked.push(params),
            { id: "bot-2", name: params.name, handle: params.name.toLowerCase() }
          ),
          send: async (params) => (asked.push(params), { handle: params.to, name: "Scout" }),
          react: async (params) => (asked.push(params), { messageId: params.messageId }),
          question: async (params) => (asked.push(params), {}),
          schedule: async (params) => (asked.push(params), params.op === "list" ? [] : null),
          goal: async (params) => (asked.push(params), null),
          skill: async (params) => (asked.push(params), { data: "QUJD" }),
          mcp: async (params) => (asked.push(params), null),
          provider: async (params) => (asked.push(params), null),
          thread: async (params) => (asked.push(params), []),
          update: async (params) => (
            asked.push(params),
            { name: params.name ?? "Pip", description: params.description ?? "" }
          ),
          notes: async (params) => (asked.push(params), "noted"),
          cockpit: async () => "cockpit",
          api: async (params) => (asked.push(params), { routes: [], organizations: [] }),
        },
      );
      return { ws, received, connection, heard, asked, runtime };
    };

    test("a reply reaches the machine it names, for that bot only, and an offline one is said so", async () => {
      const machine = crypto.randomUUID();
      const reached: unknown[] = [];
      const sent: unknown[] = [];
      hub.machines = {
        reach: async (place) => {
          reached.push(place);

          if (place.runtimeId !== machine) throw new Error("The computer is offline");

          return {
            call: async (method, params, timeoutMs) => {
              sent.push({ method, params, timeoutMs });
              return { path: "/bots/pip" };
            },
          };
        },
      };
      const { ws, received } = await replying("bot-machine", async () => null, machine);
      await until(() => received.some((m) => m.type === "bot.reply"));
      expect(received.find((m) => m.type === "bot.reply")).toMatchObject({ machine });

      const answered = await ask(ws, received, "machine.call", {
        replyId: "reply-1",
        op: "exec",
        args: { command: "pwd", timeoutMs: 1000 },
      });
      expect(answered).toMatchObject({ ok: true, result: { path: "/bots/pip" } });
      expect(reached).toEqual([{ runtimeId: machine, threadId: info.id }]);
      expect(sent).toEqual([
        {
          method: "machine.call",
          params: { threadId: info.id, op: "exec", args: { command: "pwd", timeoutMs: 1000 } },
          timeoutMs: 31_000,
        },
      ]);

      const own = await replying("bot-own");
      const refused = await ask(own.ws, own.received, "machine.call", {
        replyId: "reply-1",
        op: "workspace",
      });
      expect(refused).toMatchObject({
        ok: false,
        error: "This reply's tools act on its own runner",
      });
      const away = await replying("bot-away", async () => null, crypto.randomUUID());
      const offline = await ask(away.ws, away.received, "machine.call", {
        replyId: "reply-1",
        op: "workspace",
      });
      expect(offline).toMatchObject({ ok: false, error: "The computer is offline" });
      const missing = await ask(ws, received, "machine.call", { replyId: "nope", op: "workspace" });
      expect(missing).toMatchObject({ ok: false, error: "Unknown or finished reply" });
      expect(sent).toHaveLength(1);
    });

    test("is sent to the runner, and what the bot says comes back in order, then the end", async () => {
      const { ws, received, heard } = await replying("bot-say");
      await until(() => received.some((m) => m.type === "bot.reply"));
      expect(received.find((m) => m.type === "bot.reply")).toEqual({
        type: "bot.reply",
        replyId: "reply-1",
        bot: info,
        prompt: "hi",
        model,
      });

      ws.send(JSON.stringify({ type: "bot.say", replyId: "reply-1", text: "one" }));
      ws.send(JSON.stringify({ type: "bot.say", replyId: "reply-1", text: "two" }));
      ws.send(JSON.stringify({ type: "bot.end", replyId: "reply-1" }));

      await until(() => heard.ended.length === 1);
      expect(heard.said).toEqual(["one", "two"]);
      expect(heard.ended).toEqual([undefined]);
    });

    test("what the bot is doing comes back as a label, for the live reply only", async () => {
      const { ws, heard } = await replying("bot-activity");

      ws.send(JSON.stringify({ type: "bot.activity", replyId: "reply-1", label: "Thinking" }));
      ws.send(JSON.stringify({ type: "bot.activity", replyId: "someone-elses", label: "forged" }));
      ws.send(JSON.stringify({ type: "bot.activity", replyId: "reply-1", label: "Reading a.ts" }));
      ws.send(JSON.stringify({ type: "bot.activity", replyId: "reply-1", label: null }));
      ws.send(JSON.stringify({ type: "bot.activity", replyId: "reply-1", label: "" }));
      ws.send(JSON.stringify({ type: "bot.end", replyId: "reply-1" }));

      await until(() => heard.ended.length === 1);
      expect(heard.activity).toEqual(["Thinking", "Reading a.ts", null]);
    });

    test("a runner can only speak for a reply the control plane started, and not after it ended", async () => {
      const { ws, heard } = await replying("bot-forged");

      ws.send(JSON.stringify({ type: "bot.say", replyId: "someone-elses", text: "forged" }));
      ws.send(JSON.stringify({ type: "bot.end", replyId: "reply-1", error: "done" }));
      await until(() => heard.ended.length === 1);
      ws.send(JSON.stringify({ type: "bot.say", replyId: "reply-1", text: "late" }));
      await Bun.sleep(100);

      expect(heard.said).toEqual([]);
      expect(heard.ended).toEqual(["done"]);
    });

    test("the runner's questions about the conversation are answered for the live reply only", async () => {
      const { ws, received, asked } = await replying("bot-memory", async () => [{ role: "user" }]);

      const known = await ask(ws, received, "bot.memory", { replyId: "reply-1", op: "load" });
      expect(known).toMatchObject({ ok: true, result: [{ role: "user" }] });
      expect(asked).toEqual([{ replyId: "reply-1", op: "load" }]);

      const unknown = await ask(ws, received, "bot.memory", { replyId: "other", op: "load" });
      expect(unknown.ok).toBe(false);
      const clearing = await ask(ws, received, "bot.memory", { replyId: "reply-1", op: "clear" });
      expect(clearing.ok).toBe(false);
      expect(asked).toHaveLength(1);
    });

    test("a bot made by the runner is made for the live reply only, and with a name and an instruction", async () => {
      const { ws, received, asked } = await replying("bot-create");
      const made = { replyId: "reply-1", name: "Scout", instruction: "You research." };

      expect(await ask(ws, received, "bot.create", made)).toMatchObject({
        ok: true,
        result: { id: "bot-2", name: "Scout", handle: "scout" },
      });
      expect(asked).toEqual([made]);

      const unknown = await ask(ws, received, "bot.create", { ...made, replyId: "other" });
      expect(unknown.ok).toBe(false);
      const nameless = await ask(ws, received, "bot.create", { ...made, name: "  " });
      expect(nameless.ok).toBe(false);
      const empty = await ask(ws, received, "bot.create", { ...made, instruction: "" });
      expect(empty.ok).toBe(false);
      expect(asked).toHaveLength(1);
    });

    test("what a runner adds to a bot call is dropped: the person, the bot and the powers are the reply's", async () => {
      const { ws, received, asked } = await replying("bot-rogue");
      const rogue = { botId: "other-bot", userId: "mallory", isMain: true, avatar: "x" };

      await ask(ws, received, "bot.create", {
        replyId: "reply-1",
        name: "Scout",
        instruction: "You research.",
        ...rogue,
      });
      await ask(ws, received, "bot.update", { replyId: "reply-1", name: "Pip", ...rogue });

      expect(asked).toEqual([
        { replyId: "reply-1", name: "Scout", instruction: "You research." },
        { replyId: "reply-1", name: "Pip" },
      ]);
    });

    test("a skill's archive is asked for by a digest, for the live reply only (decision 0081)", async () => {
      const { ws, received, asked } = await replying("bot-skill");
      const digest = "a".repeat(64);

      expect(
        await ask(ws, received, "bot.skill", { replyId: "reply-1", digest, userId: "mallory" }),
      ).toMatchObject({ ok: true, result: { data: "QUJD" } });
      expect(asked).toEqual([{ replyId: "reply-1", digest }]);

      expect((await ask(ws, received, "bot.skill", { replyId: "other", digest })).ok).toBe(false);
      expect((await ask(ws, received, "bot.skill", { replyId: "reply-1", digest: "x" })).ok).toBe(
        false,
      );
      expect(asked).toHaveLength(1);
    });

    test("a bot's message to another bot is sent for the live reply only, and the other bot is a handle", async () => {
      const { ws, received, asked } = await replying("bot-send");
      const message = { replyId: "reply-1", to: "scout", text: "do A" };

      expect(
        await ask(ws, received, "bot.send", {
          ...message,
          userId: "mallory",
          from: "someone else",
        }),
      ).toMatchObject({ ok: true, result: { handle: "scout", name: "Scout" } });
      expect(asked).toEqual([message]);

      expect((await ask(ws, received, "bot.send", { ...message, replyId: "other" })).ok).toBe(
        false,
      );
      expect((await ask(ws, received, "bot.send", { ...message, to: "Scout Bot" })).ok).toBe(false);
      expect((await ask(ws, received, "bot.send", { ...message, text: " " })).ok).toBe(false);
      expect(asked).toHaveLength(1);
    });

    test("a bot's question is asked for the live reply only, with choices of two to five", async () => {
      const { ws, received, asked } = await replying("bot-question");
      const question = {
        replyId: "reply-1",
        questions: [
          {
            id: "scope",
            text: "Which first?",
            choices: [
              { label: "A", value: "A" },
              { label: "B", value: "B" },
            ],
          },
        ],
      };

      expect(await ask(ws, received, "bot.question", question)).toMatchObject({ ok: true });
      expect(asked).toEqual([question]);

      expect((await ask(ws, received, "bot.question", { ...question, replyId: "other" })).ok).toBe(
        false,
      );
      expect((await ask(ws, received, "bot.question", { ...question, questions: [] })).ok).toBe(
        false,
      );
      const one = { id: "x", text: "Which?", choices: [{ label: "A", value: "A" }] };
      expect((await ask(ws, received, "bot.question", { ...question, questions: [one] })).ok).toBe(
        false,
      );
      expect(asked).toHaveLength(1);
    });

    test("a call with a parameter that is wrong says which, so the bot can put it right", async () => {
      const { ws, received } = await replying("bot-invalid");

      const refused = await ask(ws, received, "bot.create", {
        replyId: "reply-1",
        name: " ",
        instruction: "x",
      });

      expect(refused.ok).toBe(false);
      expect(refused.error).toContain("Invalid parameters: name");
    });

    test("a bot's change to itself is made for the live reply only, and is never nothing", async () => {
      const { ws, received, asked } = await replying("bot-update");
      const change = { replyId: "reply-1", description: "Looks things up." };

      expect(await ask(ws, received, "bot.update", change)).toMatchObject({
        ok: true,
        result: { name: "Pip", description: "Looks things up." },
      });
      expect(asked).toEqual([change]);

      const unknown = await ask(ws, received, "bot.update", { ...change, replyId: "other" });
      expect(unknown.ok).toBe(false);
      const nothing = await ask(ws, received, "bot.update", { replyId: "reply-1" });
      expect(nothing.ok).toBe(false);
      const nameless = await ask(ws, received, "bot.update", { replyId: "reply-1", name: " " });
      expect(nameless.ok).toBe(false);
      expect(asked).toHaveLength(1);
    });

    test("a cancel is sent to the runner while the reply is live", async () => {
      const { received, connection } = await replying("bot-cancel");

      connection.cancelBotReply("reply-1", "Shutting down");
      connection.cancelBotReply("never-started", "ignored");

      await until(() => received.some((m) => m.type === "bot.cancel"));
      expect(received.filter((m) => m.type === "bot.cancel")).toEqual([
        { type: "bot.cancel", replyId: "reply-1", reason: "Shutting down" },
      ]);
    });

    test("a reply is not held for the runner to come back: losing the connection ends it", async () => {
      const { ws, heard } = await replying("bot-lost");

      ws.close();

      await until(() => heard.lost.length === 1);
      expect(heard.lost[0]?.message).toBe("The runtime disconnected");
    });
  });

  test("a runtime is asked for only so many terminals at once", async () => {
    const { runtime, token } = await runtimesService.create(seed.orgA, seed.userId, { name: "v" });
    await open(server.server?.port, token);
    await until(() => hub.isOnline(runtime.id));
    const connection = hub.get(runtime.id)!;
    const sink = { data: () => undefined, closed: () => undefined };
    const size = { cols: 80, rows: 24 };

    const handles = Array.from({ length: 32 }, () => connection.openTerminal("t", size, sink));

    expect(() => connection.openTerminal("t", size, sink)).toThrow("Too many terminals");
    handles[0]!.close();
    expect(() => connection.openTerminal("t", size, sink)).not.toThrow();
  });

  test("a terminal is opened, resized and closed on the runtime, and only it answers for its id", async () => {
    const { runtime, token } = await runtimesService.create(seed.orgA, seed.userId, { name: "t" });
    const ws = await open(server.server?.port, token);
    const received = inbox(ws);
    await until(() => hub.isOnline(runtime.id));
    const connection = hub.get(runtime.id)!;
    const events: string[] = [];
    const sink = {
      data: () => events.push("data"),
      closed: (reason: string) => events.push(`closed: ${reason}`),
    };

    const terminal = connection.openTerminal("t", { cols: 100, rows: 30 }, sink);
    await until(() => received.some((m) => m.type === "terminal.open"));
    const opened = received.find((m) => m.type === "terminal.open")!;

    if (opened.type !== "terminal.open") throw new Error("unreachable");

    expect(opened).toMatchObject({ threadId: "t", cols: 100, rows: 30 });

    terminal.resize(80, 24);
    ws.send(JSON.stringify({ type: "terminal.opened", viewerId: opened.viewerId }));
    await Bun.sleep(50);
    terminal.resize(80, 24);
    await until(() => received.some((m) => m.type === "terminal.resize"));
    expect(received.find((m) => m.type === "terminal.resize")).toEqual({
      type: "terminal.resize",
      viewerId: opened.viewerId,
      cols: 80,
      rows: 24,
    });
    expect(received.filter((m) => m.type === "terminal.resize")).toHaveLength(1);

    ws.send(
      JSON.stringify({
        type: "terminal.closed",
        viewerId: opened.viewerId,
        reason: "The shell ended",
      }),
    );
    await until(() => events.length > 0);
    expect(events).toEqual(["closed: The shell ended"]);
    terminal.close();
  });

  test("a runtime can only touch runs the control plane started on it", async () => {
    const { runtime, token } = await runtimesService.create(seed.orgA, seed.userId, { name: "m" });
    const ws = await open(server.server?.port, token);
    const received = inbox(ws);
    await until(() => hub.isOnline(runtime.id));
    const connection = hub.get(runtime.id)!;

    const thread = { id: crypto.randomUUID(), organizationId: seed.orgA };
    threadIds.push(thread.id);
    const ended: string[] = [];
    connection.startRun("run-1", thread, {
      event: () => undefined,
      end: (outcome) => ended.push(outcome),
      lost: () => undefined,
    });

    const unknown = await ask(ws, received, "memory.append", {
      runId: "someone-elses",
      turn: 0,
      messages: [],
    });
    expect(unknown.ok).toBe(false);

    const message = { role: "user", content: [{ type: "text", text: "hi" }] };
    const appended = await ask(ws, received, "memory.append", {
      runId: "run-1",
      turn: 0,
      messages: [message],
      scope: { sessionId: "other-thread", metadata: { organizationId: "other-org" } },
    });
    expect(appended.ok).toBe(true);
    const loaded = await store.load({
      scope: { sessionId: thread.id, metadata: { organizationId: seed.orgA } },
    });
    expect(JSON.stringify(loaded)).toContain("hi");
    expect(
      await store.load({
        scope: { sessionId: "other-thread", metadata: { organizationId: "other-org" } },
      }),
    ).toEqual([]);

    ws.send(JSON.stringify({ type: "run.end", runId: "run-1", seq: 1, outcome: "response" }));
    await until(() => ended.length > 0);
    const late = await ask(ws, received, "memory.append", {
      runId: "run-1",
      turn: 1,
      messages: [],
    });
    expect(late.ok).toBe(false);
  });

  test("a malformed frame is dropped and malformed call parameters are answered, not thrown", async () => {
    const { runtime, token } = await runtimesService.create(seed.orgA, seed.userId, {
      name: "bad",
    });
    const ws = await open(server.server?.port, token);
    const received = inbox(ws);
    await until(() => hub.isOnline(runtime.id));
    const ended: string[] = [];
    hub
      .get(runtime.id)!
      .startRun(
        "run-bad",
        { id: crypto.randomUUID(), organizationId: seed.orgA },
        { event: () => undefined, end: (outcome) => ended.push(outcome), lost: () => undefined },
      );

    for (const frame of [
      "not json",
      "null",
      "{}",
      '{"type":"run.end"}',
      '{"type":"run.end","runId":7}',
    ]) {
      ws.send(frame);
    }
    const noParams = await ask(ws, received, "repo.access", undefined);
    expect(noParams.ok).toBe(false);
    const badAppend = await ask(ws, received, "memory.append", { runId: "run-bad", turn: "0" });
    expect(badAppend.ok).toBe(false);
    expect(badAppend.error).toContain("Invalid parameters");

    expect(hub.isOnline(runtime.id)).toBe(true);
    expect(ended).toEqual([]);
    ws.send(JSON.stringify({ type: "run.end", runId: "run-bad", seq: 1, outcome: "response" }));
    await until(() => ended.length > 0);
  });

  test("a socket upgraded while its runtime was being revoked is cut off once attached", async () => {
    const { runtime, token } = await runtimesService.create(seed.orgA, seed.userId, {
      name: "race",
    });
    const checked = await runtimesService.authenticate(token);
    await runtimesService.revoke(seed.orgA, seed.userId, runtime.id);
    const authenticate = runtimesService.authenticate;
    runtimesService.authenticate = async () => checked;
    try {
      const ws = await open(server.server?.port, token);
      const closed = new Promise<number>((resolve) => {
        ws.onclose = (event) => resolve(event.code);
      });
      expect(await closed).toBe(4002);
      expect(hub.isOnline(runtime.id)).toBe(false);
    } finally {
      runtimesService.authenticate = authenticate;
    }
  });

  test("a runtime can send only the events its agent projects, and only a known outcome", async () => {
    const { runtime, token } = await runtimesService.create(seed.orgA, seed.userId, { name: "ev" });
    const ws = await open(server.server?.port, token);
    await until(() => hub.isOnline(runtime.id));
    const events: unknown[] = [];
    const ended: string[] = [];
    hub
      .get(runtime.id)!
      .startRun(
        "run-ev",
        { id: crypto.randomUUID(), organizationId: seed.orgA },
        { event: (e) => events.push(e), end: (o) => ended.push(o), lost: () => undefined },
      );

    const forged = { type: "snapshot", messages: [], running: false };
    ws.send(JSON.stringify({ type: "run.event", runId: "run-ev", seq: 1, event: forged }));
    ws.send(
      JSON.stringify({ type: "run.event", runId: "run-ev", seq: 2, event: { type: "done" } }),
    );
    ws.send(JSON.stringify({ type: "run.end", runId: "run-ev", seq: 3, outcome: "totally-fine" }));
    ws.send(
      JSON.stringify({
        type: "run.event",
        runId: "run-ev",
        seq: 4,
        event: { type: "reasoning", delta: "Hmm." },
      }),
    );
    ws.send(
      JSON.stringify({
        type: "run.event",
        runId: "run-ev",
        seq: 5,
        event: { type: "text", delta: "ok" },
      }),
    );
    await until(() => events.length > 1);
    expect(events).toEqual([
      { type: "reasoning", delta: "Hmm." },
      { type: "text", delta: "ok" },
    ]);
    expect(ended).toEqual([]);
  });

  test("a runtime is not online until it says hello with a version we speak", async () => {
    const { runtime, token } = await runtimesService.create(seed.orgA, seed.userId, { name: "h" });
    const silent = await open(server.server?.port, token, "/connect", null);
    await Bun.sleep(150);
    expect(hub.isOnline(runtime.id)).toBe(false);
    silent.send(JSON.stringify({ type: "hello", version: WIRE_VERSION }));
    await until(() => hub.isOnline(runtime.id));

    const other = await runtimesService.create(seed.orgA, seed.userId, { name: "old" });
    const closed = new Promise<{ code: number; reason: string }>((resolve) => {
      open(server.server?.port, other.token, "/connect", WIRE_VERSION + 1).then((ws) => {
        ws.onclose = (event) => resolve({ code: event.code, reason: event.reason });
      });
    });
    const { code, reason } = await closed;
    expect(code).toBe(4000);
    expect(reason).toContain("Unsupported runtime version");
    expect(hub.isOnline(other.runtime.id)).toBe(false);
  });

  const asPerson = (method: string, path: string, token: string) =>
    fetch(`http://localhost:${full.server?.port}${path}`, {
      method,
      headers: { authorization: `Bearer ${token}` },
    });

  test("the release a runtime says it is shows in the list, marked when it is behind the server", async () => {
    const { runtime, token } = await runtimesService.create(owner.organizationId, owner.userId, {
      name: "versioned",
    });
    const ws = await open(full.server?.port, token, "/runtimes/connect", null);
    ws.send(JSON.stringify({ type: "hello", version: WIRE_VERSION, runs: [], build: "0.2.0" }));
    await until(() => hub.isOnline(runtime.id));
    expect(hub.buildOf(runtime.id)).toBe("0.2.0");

    const listed = async () => {
      const response = await asPerson("GET", "/runtimes", owner.token);
      const rows = (await response.json()) as {
        id: string;
        build: string | null;
        outdated: boolean;
      }[];
      return rows.find((row) => row.id === runtime.id);
    };
    const before = process.env.AVEN_VERSION;
    try {
      process.env.AVEN_VERSION = "0.3.0";
      expect(await listed()).toMatchObject({ build: "0.2.0", outdated: true });
      process.env.AVEN_VERSION = "0.2.0";
      expect(await listed()).toMatchObject({ build: "0.2.0", outdated: false });
      process.env.AVEN_VERSION = "latest";
      expect(await listed()).toMatchObject({ outdated: false });
    } finally {
      if (before === undefined) delete process.env.AVEN_VERSION;
      else process.env.AVEN_VERSION = before;
    }
  });

  test("a runtime that does not say which release it is has none", async () => {
    const { runtime, token } = await runtimesService.create(owner.organizationId, owner.userId, {
      name: "unversioned",
    });
    await open(full.server?.port, token, "/runtimes/connect");
    await until(() => hub.isOnline(runtime.id));
    expect(hub.buildOf(runtime.id)).toBeUndefined();
  });

  test("a runtime offers the agent backends it names that this server knows, and native when it names none", async () => {
    const said = async (backends?: string[]) => {
      const { runtime, token } = await runtimesService.create(owner.organizationId, owner.userId, {
        name: "backends",
      });
      const ws = await open(full.server?.port, token, "/runtimes/connect", null);
      ws.send(JSON.stringify({ type: "hello", version: WIRE_VERSION, runs: [], backends }));
      await until(() => hub.isOnline(runtime.id));
      return hub.get(runtime.id)!;
    };

    expect((await said()).offers("native")).toBe(true);
    expect((await said(["native", "not-yet-known"])).offers("native")).toBe(true);
    expect((await said(["not-yet-known"])).offers("native")).toBe(false);
  });

  test("how loaded a runtime's machine is shows in the list while it is online, and not after", async () => {
    const { runtime, token } = await runtimesService.create(owner.organizationId, owner.userId, {
      name: "monitored",
    });
    const listed = async () => {
      const response = await asPerson("GET", "/runtimes", owner.token);
      const rows = (await response.json()) as { id: string; stats: unknown }[];
      return rows.find((row) => row.id === runtime.id);
    };
    const ws = await open(full.server?.port, token, "/runtimes/connect");
    await until(() => hub.isOnline(runtime.id));
    expect(await listed()).toMatchObject({ stats: null });

    ws.send(
      JSON.stringify({
        type: "host.stats",
        stats: {
          cores: 4,
          cpuPercent: 37,
          memoryUsedBytes: 6,
          memoryTotalBytes: 16,
          diskUsedBytes: 74,
          diskTotalBytes: 98,
          sandboxes: 2,
        },
      }),
    );
    await until(() => hub.statsOf(runtime.id) !== undefined);
    expect(await listed()).toMatchObject({
      stats: { cpuPercent: 37, sandboxes: 2, memoryTotalBytes: 16, reportedAt: expect.any(String) },
    });

    ws.send(JSON.stringify({ type: "host.stats", stats: { cores: 0 } }));
    ws.send(JSON.stringify({ type: "hello", version: WIRE_VERSION, runs: [] }));
    await Bun.sleep(100);
    expect(hub.statsOf(runtime.id)).toMatchObject({ cpuPercent: 37, sandboxes: 2 });

    ws.close();
    await until(() => !hub.isOnline(runtime.id));
    expect(hub.statsOf(runtime.id)).toBeUndefined();
    expect(await listed()).toMatchObject({ stats: null });
  });

  test("a process that ended is handed to the control plane with the runtime that said so, and a bad frame is not (decision 0144)", async () => {
    const { runtime, token } = await runtimesService.create(owner.organizationId, owner.userId, {
      name: "process-ends",
    });
    const told: { runtimeId: string; processId: string }[] = [];
    const before = hub.processEnds;
    hub.processEnds = {
      ended: async (runtimeId, ended) => void told.push({ runtimeId, processId: ended.processId }),
    };
    try {
      const ws = await open(full.server?.port, token, "/runtimes/connect");
      await until(() => hub.isOnline(runtime.id));
      const frame = {
        type: "process.ended",
        threadId: crypto.randomUUID(),
        processId: "p1",
        command: "bun test",
        status: "exited",
        exitCode: 0,
        ranSeconds: 3,
        stdout: "ok",
        stderr: "",
      };
      ws.send(JSON.stringify({ ...frame, threadId: "not-a-uuid" }));
      ws.send(JSON.stringify(frame));
      await until(() => told.length > 0);
      expect(told).toEqual([{ runtimeId: runtime.id, processId: "p1" }]);
      ws.close();
    } finally {
      hub.processEnds = before;
    }
  });

  test("a run on the control plane settles the machine's process watch, and suspends it when the machine connects late", async () => {
    const agent = await runtimesService.create(owner.organizationId, owner.userId, {
      name: "watch-agent",
    });
    const machine = await runtimesService.create(owner.organizationId, owner.userId, {
      name: "watch-machine",
    });
    const late = await runtimesService.create(owner.organizationId, owner.userId, {
      name: "watch-late",
    });
    const agentWs = await open(server.server?.port, agent.token);
    const machineWs = await open(server.server?.port, machine.token);
    const heard: ControlPlaneToRuntime[] = [];
    const take = (ws: WebSocket, into: ControlPlaneToRuntime[]) => {
      ws.addEventListener("message", (event) => {
        if (typeof event.data !== "string") return;

        const message = JSON.parse(event.data) as ControlPlaneToRuntime;
        into.push(message);

        if (message.type === "call" && message.method === "process.watch") {
          ws.send(JSON.stringify({ type: "reply", id: message.id, ok: true, result: null }));
        }
      });
    };
    take(machineWs, heard);
    await until(() => hub.isOnline(agent.runtime.id) && hub.isOnline(machine.runtime.id));
    const thread = {
      id: crypto.randomUUID(),
      organizationId: owner.organizationId,
      machine: machine.runtime.id,
    };
    const sink = { event: () => undefined, end: () => undefined, lost: () => undefined };
    hub.get(agent.runtime.id)!.startRun("run-watch", thread, sink);
    agentWs.send(
      JSON.stringify({ type: "run.end", runId: "run-watch", seq: 1, outcome: "response" }),
    );
    await until(() => heard.some((message) => message.type === "call"));
    expect(heard.find((message) => message.type === "call")).toMatchObject({
      method: "process.watch",
      params: { threadId: thread.id, phase: "settle" },
    });

    const own = { id: crypto.randomUUID(), organizationId: owner.organizationId };
    hub.get(agent.runtime.id)!.startRun("run-own", own, sink);
    agentWs.send(
      JSON.stringify({ type: "run.end", runId: "run-own", seq: 1, outcome: "response" }),
    );
    await Bun.sleep(50);
    expect(heard.filter((message) => message.type === "call")).toHaveLength(1);

    const waiting = {
      id: crypto.randomUUID(),
      organizationId: owner.organizationId,
      machine: late.runtime.id,
    };
    hub.get(agent.runtime.id)!.startRun("run-late", waiting, sink);
    agentWs.send(
      JSON.stringify({ type: "run.end", runId: "run-late", seq: 1, outcome: "interaction" }),
    );
    await Bun.sleep(30);
    const lateHeard: ControlPlaneToRuntime[] = [];
    const lateWs = new WebSocket(`ws://localhost:${server.server?.port}/connect`, {
      headers: { authorization: `Bearer ${late.token}` },
    } as unknown as string[]);
    sockets.push(lateWs);
    take(lateWs, lateHeard);
    await new Promise<void>((resolve, reject) => {
      lateWs.onopen = () => {
        lateWs.send(JSON.stringify({ type: "hello", version: WIRE_VERSION, runs: [] }));
        resolve();
      };
      lateWs.onerror = () => reject(new Error("connect failed"));
    });
    await until(() => lateHeard.some((message) => message.type === "call"));
    expect(lateHeard.find((message) => message.type === "call")).toMatchObject({
      method: "process.watch",
      params: { threadId: waiting.id, phase: "suspend" },
    });
  });

  test("a machine's guest with no live run on the control plane is suspended when the machine connects", async () => {
    await runtimesService.ensureLocal();
    const machine = await runtimesService.create(owner.organizationId, owner.userId, {
      name: "guest-machine",
    });
    const agentWs = await open(server.server?.port, runtimesService.localToken);
    await until(() => hub.isOnline(LOCAL_RUNTIME_ID));
    const live = {
      id: crypto.randomUUID(),
      organizationId: owner.organizationId,
      machine: machine.runtime.id,
    };
    const stale = crypto.randomUUID();
    const sink = { event: () => undefined, end: () => undefined, lost: () => undefined };
    hub.get(LOCAL_RUNTIME_ID)!.startRun("run-guest", live, sink);
    const heard: ControlPlaneToRuntime[] = [];
    const machineWs = new WebSocket(`ws://localhost:${server.server?.port}/connect`, {
      headers: { authorization: `Bearer ${machine.token}` },
    } as unknown as string[]);
    sockets.push(machineWs);
    machineWs.addEventListener("message", (event) => {
      if (typeof event.data !== "string") return;

      const message = JSON.parse(event.data) as ControlPlaneToRuntime;
      heard.push(message);

      if (message.type === "call") {
        machineWs.send(JSON.stringify({ type: "reply", id: message.id, ok: true, result: null }));
      }
    });
    await new Promise<void>((resolve, reject) => {
      machineWs.onopen = () => {
        machineWs.send(
          JSON.stringify({
            type: "hello",
            version: WIRE_VERSION,
            runs: [],
            guests: [live.id, stale],
          }),
        );
        resolve();
      };
      machineWs.onerror = () => reject(new Error("connect failed"));
    });

    await until(() => heard.some((message) => message.type === "call"));
    await Bun.sleep(50);
    const watched = heard.filter((message) => message.type === "call");
    expect(watched).toHaveLength(1);
    expect(watched[0]).toMatchObject({
      method: "process.watch",
      params: { threadId: stale, phase: "suspend" },
    });
    agentWs.send(JSON.stringify({ type: "run.end", runId: "run-guest", seq: 1, outcome: "done" }));
  });

  test("revoking cuts a connected runtime off and fails its live runs", async () => {
    const { runtime, token } = await runtimesService.create(owner.organizationId, owner.userId, {
      name: "x",
    });
    const ws = await open(full.server?.port, token, "/runtimes/connect");
    await until(() => hub.isOnline(runtime.id));
    const lost: Error[] = [];
    hub
      .get(runtime.id)!
      .startRun(
        "run-revoke",
        { id: crypto.randomUUID(), organizationId: owner.organizationId },
        { event: () => undefined, end: () => undefined, lost: (error) => lost.push(error) },
      );
    const closed = new Promise<number>((resolve) => {
      ws.onclose = (event) => resolve(event.code);
    });

    expect((await asPerson("DELETE", `/runtimes/${runtime.id}`, outsider.token)).status).toBe(404);
    expect(hub.isOnline(runtime.id)).toBe(true);

    expect((await asPerson("DELETE", `/runtimes/${runtime.id}`, owner.token)).status).toBe(200);
    expect(await closed).toBe(4002);
    expect(lost).toHaveLength(1);
    expect(hub.isOnline(runtime.id)).toBe(false);
  });

  test("rotating the token cuts the runtime off and only the new token connects", async () => {
    const { runtime, token } = await runtimesService.create(owner.organizationId, owner.userId, {
      name: "r",
    });
    const ws = await open(full.server?.port, token, "/runtimes/connect");
    await until(() => hub.isOnline(runtime.id));
    const closed = new Promise<number>((resolve) => {
      ws.onclose = (event) => resolve(event.code);
    });

    const refused = await asPerson("POST", `/runtimes/${runtime.id}/rotate`, outsider.token);
    expect(refused.status).toBe(404);
    expect(hub.isOnline(runtime.id)).toBe(true);
    const response = await asPerson("POST", `/runtimes/${runtime.id}/rotate`, owner.token);
    expect(response.status).toBe(200);
    const rotated = (await response.json()) as { token: string; runtime: { tokenHint: string } };
    expect(rotated.token).not.toBe(token);
    expect(rotated.runtime.tokenHint).toBe(rotated.token.slice(-4));
    expect(await closed).toBe(4002);

    await expect(open(full.server?.port, token, "/runtimes/connect")).rejects.toThrow();
    await open(full.server?.port, rotated.token, "/runtimes/connect");
    await until(() => hub.isOnline(runtime.id));
    const listed = await runtimesService.list(owner.organizationId, owner.userId);
    expect(JSON.stringify(listed)).not.toContain(rotated.token);
  });

  describe("a connection that drops", () => {
    const thread = () => ({ id: crypto.randomUUID(), organizationId: seed.orgA });
    const sink = () => {
      const seen = { events: [] as string[], ended: [] as string[], lost: [] as Error[] };
      return {
        seen,
        sink: {
          event: (event: { type: string; delta?: string }) =>
            seen.events.push(event.delta ?? event.type),
          end: (outcome: string) => seen.ended.push(outcome),
          lost: (error: Error) => seen.lost.push(error),
        },
      };
    };
    const text = (runId: string, seq: number, delta: string) =>
      JSON.stringify({ type: "run.event", runId, seq, event: { type: "text", delta } });

    const dropped = async (name: string, runId: string) => {
      const { runtime, token } = await runtimesService.create(seed.orgA, seed.userId, { name });
      const ws = await open(server.server?.port, token);
      await until(() => hub.isOnline(runtime.id));
      const followed = sink();
      hub.get(runtime.id)!.startRun(runId, thread(), followed.sink);
      return { runtime, token, ws, ...followed };
    };

    test("keeps its run, and the runtime reconnecting for it gets what the control plane missed", async () => {
      const { runtime, token, ws, seen } = await dropped("keep", "run-keep");
      ws.send(text("run-keep", 1, "a"));
      ws.send(text("run-keep", 2, "b"));
      await until(() => seen.events.length === 2);
      ws.close();
      await until(() => !hub.isOnline(runtime.id));
      expect(seen.lost).toEqual([]);

      const back = await open(server.server?.port, token, "/connect", WIRE_VERSION, ["run-keep"]);
      const received = inbox(back);
      await until(() => received.some((m) => m.type === "run.attach"));
      expect(received.find((m) => m.type === "run.attach")).toEqual({
        type: "run.attach",
        runId: "run-keep",
        after: 2,
      });

      back.send(text("run-keep", 2, "b"));
      back.send(text("run-keep", 3, "c"));
      back.send(
        JSON.stringify({ type: "run.end", runId: "run-keep", seq: 4, outcome: "response" }),
      );
      await until(() => seen.ended.length === 1);
      expect(seen.events).toEqual(["a", "b", "c"]);
      await until(() => received.some((m) => m.type === "run.ack"));
    });

    test("loses a run whose runtime comes back without it", async () => {
      const { token, ws, seen } = await dropped("restarted", "run-gone");
      ws.close();
      await Bun.sleep(50);
      await open(server.server?.port, token);
      await until(() => seen.lost.length === 1);
      expect(seen.lost[0]?.message).toContain("restarted");
    });

    test("tells a runtime to stop a run the control plane does not follow", async () => {
      const { runtime, token } = await runtimesService.create(seed.orgA, seed.userId, {
        name: "ghost",
      });
      const ws = await open(server.server?.port, token, "/connect", WIRE_VERSION, ["ghost-run"]);
      const received = inbox(ws);
      await until(() => hub.isOnline(runtime.id));
      await until(() => received.some((m) => m.type === "run.cancel"));
      expect(received.find((m) => m.type === "run.cancel")).toMatchObject({ runId: "ghost-run" });
    });

    test("loses a run whose runtime never comes back, after the grace period", async () => {
      const { ws, seen } = await dropped("away", "run-away");
      ws.close();
      await until(() => seen.lost.length === 1, GRACE_MS + 2000);
    });

    test("a cancel asked for while the run waits is sent when the runtime is back", async () => {
      const { runtime, token, ws, seen } = await dropped("cancel", "run-cancel");
      ws.close();
      await until(() => !hub.isOnline(runtime.id));
      hub.cancelRun(runtime.id, "run-cancel", "Cancelled by user");

      const back = await open(server.server?.port, token, "/connect", WIRE_VERSION, ["run-cancel"]);
      const received = inbox(back);
      await until(() => received.some((m) => m.type === "run.cancel"));
      expect(received.find((m) => m.type === "run.cancel")).toMatchObject({
        runId: "run-cancel",
        reason: "Cancelled by user",
      });
      expect(seen.lost).toEqual([]);
    });

    test("a transcript call sent again after a lost reply adds nothing twice", async () => {
      const { runtime, token } = await runtimesService.create(seed.orgA, seed.userId, {
        name: "again",
      });
      const ws = await open(server.server?.port, token);
      const received = inbox(ws);
      await until(() => hub.isOnline(runtime.id));
      const threadInfo = thread();
      threadIds.push(threadInfo.id);
      hub.get(runtime.id)!.startRun("run-again", threadInfo, sink().sink);
      const params = {
        runId: "run-again",
        turn: 0,
        messages: [{ role: "user", content: "hi" }],
      };
      expect((await ask(ws, received, "memory.append", params)).ok).toBe(true);
      expect((await ask(ws, received, "memory.append", params)).ok).toBe(true);
      const stored = await store.load({
        scope: { sessionId: threadInfo.id, metadata: { organizationId: seed.orgA } },
      });
      expect(stored).toHaveLength(1);
    });
  });

  describe("a run held for a runtime that is away", () => {
    const watched = () => {
      const lost: { message: string; at: number }[] = [];
      return {
        lost,
        sink: {
          event: () => undefined,
          end: () => undefined,
          lost: (error: Error) => lost.push({ message: error.message, at: Date.now() }),
        },
      };
    };

    const heldRun = (sink: ReturnType<typeof watched>["sink"]) => ({
      thread: { id: crypto.randomUUID(), organizationId: seed.orgA },
      sink,
      lastSeq: 0,
      appended: new Set<number>(),
      skills: new Set<string>(),
      mcp: new Set<string>(),
    });

    test("the same runtime held twice is given one grace, so the runs of both holds are lost once each", async () => {
      const grace = 300;
      const hub = new RuntimeHub(store, undefined, grace);
      const runtimeId = crypto.randomUUID();
      const first = watched();
      const second = watched();

      hub.hold(runtimeId, [["run-first", heldRun(first.sink)]]);
      await Bun.sleep(250);
      hub.hold(runtimeId, [["run-second", heldRun(second.sink)]]);
      await Bun.sleep(200);

      expect(first.lost).toEqual([]);
      expect(second.lost).toEqual([]);

      await until(() => first.lost.length === 1 && second.lost.length === 1);
      expect(first.lost[0]?.message).toBe("The runtime disconnected");
      expect(second.lost[0]?.message).toBe("The runtime disconnected");
    });

    test("shutting down answers every held run with an explicit failure, and nothing else", async () => {
      const hub = new RuntimeHub(store, undefined, 60_000);
      const away = watched();
      const elsewhere = watched();

      hub.hold(crypto.randomUUID(), [["run-away", heldRun(away.sink)]]);
      hub.hold(crypto.randomUUID(), [
        ["run-elsewhere-1", heldRun(elsewhere.sink)],
        ["run-elsewhere-2", heldRun(elsewhere.sink)],
      ]);

      hub.closeAll();

      expect(away.lost.map((entry) => entry.message)).toEqual(["The control plane shut down"]);
      expect(elsewhere.lost.map((entry) => entry.message)).toEqual([
        "The control plane shut down",
        "The control plane shut down",
      ]);

      await Bun.sleep(50);
      expect(away.lost).toHaveLength(1);
      expect(elsewhere.lost).toHaveLength(2);
    });
  });
});
