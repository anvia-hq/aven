import { afterEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { Agent, createQuestionTool, createTool, type CompletionRequest } from "@anvia/core";
import {
  scriptedModel,
  text,
  toolCall,
  type ScriptStep,
} from "@aven/agents/testing/scripted-model";
import { z } from "zod";

import {
  decodeViewerFrame,
  encodeViewerFrame,
  type RuntimeToControlPlane,
} from "@aven/protocol/runtime-wire";

import { startRuntime, type CreateRuntimeAgent } from "./runner";
import type { ThreadSandbox, ThreadWorkspaces } from "./sandbox";
import { directoryWorkspaces } from "./testing/directory-workspaces";
import { fakeDesktop } from "./testing/fake-desktop";
import { goalSessionMarker } from "./goal-report";
import { journalPath } from "./testing/journal-path";

// A control plane that records what the runtime sends and lets the test send frames back.
function fakeControlPlane(options: { storesTranscripts?: boolean } = {}) {
  // Whether the transcript the runner sends home is taken; a test can change it as it goes.
  const transcripts = { stored: options.storesTranscripts !== false };
  const received: RuntimeToControlPlane[] = [];
  const receivedBinary: Uint8Array[] = [];
  let client: { send(data: string | Uint8Array): void; close(): void } | undefined;
  const opened = Promise.withResolvers<void>();
  const server = Bun.serve({
    port: 0,
    fetch: (request, srv) =>
      srv.upgrade(request) ? undefined : new Response("no", { status: 400 }),
    websocket: {
      open(ws) {
        client = ws;
        opened.resolve();
      },
      message(ws, data) {
        if (typeof data !== "string") {
          receivedBinary.push(new Uint8Array(data));
          return;
        }
        const message = JSON.parse(data) as RuntimeToControlPlane;
        received.push(message);
        // The transcript the runner sends home is taken, unless a test says otherwise.
        if (message.type === "call" && message.method === "memory.append" && transcripts.stored)
          ws.send(JSON.stringify({ type: "reply", id: message.id, ok: true, result: null }));
      },
    },
  });
  return {
    url: `ws://localhost:${server.port}`,
    received,
    receivedBinary,
    transcripts,
    opened: opened.promise,
    send: (message: unknown) => client?.send(JSON.stringify(message)),
    drop: () => client?.close(),
    sendBinary: (frame: Uint8Array) => client?.send(frame),
    stop: () => server.stop(true),
  };
}

const thread = { id: "thread-1", organizationId: "org-1" };
const runStart = { type: "run.start", runId: "run-1", thread, prompt: "hi" };

// Sandboxes that come up when the test says so, and report a running process while `busy.now`.
function slowSandbox() {
  const gate = Promise.withResolvers<void>();
  const released: string[] = [];
  const busy = { now: false };
  const sandbox: ThreadWorkspaces = {
    async acquire(): Promise<ThreadSandbox> {
      await gate.promise;
      return { tools: [], hasRunningProcesses: async () => busy.now };
    },
    desktop: () => undefined,
    workspace: async () => undefined,
    async release(threadId) {
      released.push(threadId);
    },
    async dispose() {},
  };
  return { sandbox, up: gate.resolve, released, busy };
}

// An agent that answers from a script, one step per model call.
const agentThat =
  (...steps: ScriptStep[]): CreateRuntimeAgent =>
  ({ id }) => ({
    agent: new Agent({ id, model: scriptedModel(steps), instructions: "x" }),
  });

const reply = () => agentThat([text("ok")]);

const until = async (condition: () => boolean) => {
  for (let i = 0; i < 100 && !condition(); i++) await Bun.sleep(20);
  expect(condition()).toBe(true);
};

const cleanups: (() => unknown)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

function connect(
  options: Partial<Parameters<typeof startRuntime>[0]> & {
    sandbox: ThreadWorkspaces;
    storesTranscripts?: boolean;
  },
) {
  const { storesTranscripts, ...runtimeOptions } = options;
  const plane = fakeControlPlane({ storesTranscripts });
  const runtime = startRuntime({
    url: plane.url,
    token: "t",
    journalPath: journalPath(),
    ...runtimeOptions,
  });
  cleanups.push(() => runtime.stop(), plane.stop);
  return { plane, runtime };
}

describe("startRuntime desktops", () => {
  const viewerId = crypto.randomUUID();
  const withDesktop = (desktop: ReturnType<typeof fakeDesktop>["desktop"] | undefined) => {
    const { sandbox, ...rest } = slowSandbox();
    return { sandbox: { ...sandbox, desktop: () => desktop }, ...rest };
  };

  test("streams a thread's desktop to a viewer and relays the viewer's bytes back", async () => {
    const fake = fakeDesktop();
    const { plane, runtime } = connect({ sandbox: withDesktop(fake.desktop).sandbox });
    await runtime.ready;

    plane.send({ type: "desktop.open", viewerId, threadId: "thread-1" });
    await until(() => plane.received.some((message) => message.type === "desktop.opened"));
    await fake.push(new Uint8Array([82, 70, 66]));
    await until(() => plane.receivedBinary.length === 1);
    expect(decodeViewerFrame(plane.receivedBinary[0]!)).toEqual({
      viewerId,
      payload: new Uint8Array([82, 70, 66]),
    });

    plane.sendBinary(encodeViewerFrame(viewerId, new Uint8Array([9])));
    await until(() => fake.record.written.length === 1);
    expect(fake.record.written[0]).toEqual(new Uint8Array([9]));

    plane.send({ type: "desktop.close", viewerId });
    await until(() => fake.record.closed);
  });

  test("answers a desktop call with its result, or with why it failed", async () => {
    const { plane, runtime } = connect({ sandbox: withDesktop(fakeDesktop().desktop).sandbox });
    await runtime.ready;

    plane.send({ type: "call", id: "c1", method: "desktop.status", params: { threadId: "t1" } });
    plane.send({ type: "call", id: "c2", method: "desktop.takeover", params: { threadId: "t1" } });

    await until(() => plane.received.filter((message) => message.type === "reply").length === 2);
    const replies = plane.received.filter((message) => message.type === "reply");
    expect(replies.find((reply) => reply.id === "c1")).toMatchObject({
      ok: true,
      result: { state: "running", control: { held: false } },
    });
    expect(replies.find((reply) => reply.id === "c2")).toMatchObject({
      ok: false,
      error: "Invalid parameters",
    });
  });

  test("a sandbox someone is watching is not released as idle", async () => {
    const fake = fakeDesktop();
    const { sandbox, up, released } = withDesktop(fake.desktop);
    const { plane, runtime } = connect({
      sandbox,
      idleReleaseMs: 50,
      createAgent: reply(),
    });
    await runtime.ready;
    up();
    plane.send(runStart);
    await until(() => plane.received.some((message) => message.type === "run.end"));
    plane.send({ type: "desktop.open", viewerId, threadId: "thread-1" });
    await until(() => plane.received.some((message) => message.type === "desktop.opened"));

    await Bun.sleep(250);
    expect(released).toEqual([]);

    plane.send({ type: "desktop.close", viewerId });
    await until(() => released.length === 1);
  });
});

describe("startRuntime", () => {
  test("the sandbox gets the repository's access by asking the control plane about the run", async () => {
    const access = {
      cloneUrl: "https://github.com/acme/web.git",
      defaultBranch: "main",
      token: "t",
    };
    let given: unknown;
    const sandbox: ThreadWorkspaces = {
      async acquire(_thread, repo): Promise<ThreadSandbox> {
        given = await repo();
        return { tools: [], hasRunningProcesses: async () => false };
      },
      desktop: () => undefined,
      workspace: async () => undefined,
      async release() {},
      async dispose() {},
    };
    const { plane, runtime } = connect({ sandbox, createAgent: reply() });
    await runtime.ready;
    plane.send(runStart);

    await until(() => plane.received.some((message) => message.type === "call"));
    const call = plane.received.find((message) => message.type === "call");
    expect(call).toMatchObject({ method: "repo.access", params: { runId: "run-1" } });
    plane.send({ type: "reply", id: (call as { id: string }).id, ok: true, result: access });

    await until(() => given !== undefined);
    expect(given).toEqual(access);
  });

  test("a cancel that arrives while the sandbox is still starting ends the run before it begins", async () => {
    const { sandbox, up } = slowSandbox();
    let created = false;
    const { plane, runtime } = connect({
      sandbox,
      createAgent: (input) => {
        created = true;
        return reply()(input);
      },
    });
    await runtime.ready;
    plane.send(runStart);
    await Bun.sleep(50);
    plane.send({ type: "run.cancel", runId: "run-1", reason: "stopped by the user" });
    await Bun.sleep(50);
    up();

    await until(() => plane.received.some((message) => message.type === "run.end"));
    expect(plane.received.find((message) => message.type === "run.end")).toMatchObject({
      outcome: "error",
      error: "stopped by the user",
    });
    expect(created).toBe(false);
  });

  test("a transcript the control plane never takes fails the run with a clear error", async () => {
    const { sandbox, up } = slowSandbox();
    up();
    const { plane, runtime } = connect({
      sandbox,
      callTimeoutMs: 100,
      storesTranscripts: false,
      createAgent: reply(),
    });
    await runtime.ready;
    plane.send(runStart);

    await until(() => plane.received.some((message) => message.type === "run.end"));
    const end = plane.received.find((message) => message.type === "run.end");
    expect(end).toMatchObject({ outcome: "error" });
    expect(end && "error" in end ? end.error : "").toContain("did not answer memory.append");
  });

  test("a thread with nothing running gives up its sandbox after the idle time", async () => {
    const { sandbox, up, released } = slowSandbox();
    up();
    const { plane, runtime } = connect({
      sandbox,
      idleReleaseMs: 50,
      createAgent: reply(),
    });
    await runtime.ready;
    plane.send(runStart);

    await until(() => released.includes("thread-1"));
    expect(plane.received.some((message) => message.type === "run.end")).toBe(true);
  });

  test("a thread whose sandbox still has a running process keeps it until the process ends", async () => {
    const { sandbox, up, released, busy } = slowSandbox();
    up();
    busy.now = true;
    const { plane, runtime } = connect({
      sandbox,
      idleReleaseMs: 40,
      createAgent: reply(),
    });
    await runtime.ready;
    plane.send(runStart);
    await until(() => plane.received.some((message) => message.type === "run.end"));

    // Several idle periods pass with a dev server still up.
    await Bun.sleep(250);
    expect(released).toEqual([]);

    busy.now = false;
    await until(() => released.includes("thread-1"));
  });

  test("a run that starts while the idle check is asking keeps the sandbox", async () => {
    const { sandbox, up, released } = slowSandbox();
    up();
    const asking = Promise.withResolvers<void>();
    const hold = Promise.withResolvers<void>();
    const asked = Promise.withResolvers<void>();
    const checking: ThreadWorkspaces = {
      ...sandbox,
      acquire: async () => ({
        tools: [],
        hasRunningProcesses: async () => {
          asked.resolve();
          await asking.promise;
          return false;
        },
      }),
    };
    let runs = 0;
    const { plane, runtime } = connect({
      sandbox: checking,
      idleReleaseMs: 30,
      // The first run ends at once; the second is still going when the idle check comes back.
      createAgent: (input) =>
        ++runs === 1
          ? reply()(input)
          : agentThat(async () => {
              await hold.promise;
              return [text("ok")];
            })(input),
    });
    await runtime.ready;
    plane.send(runStart);
    await asked.promise;

    plane.send({ ...runStart, runId: "run-2" });
    await Bun.sleep(50);
    asking.resolve();
    await Bun.sleep(100);
    expect(released).toEqual([]);
    hold.resolve();
  });
});

describe("startRuntime runs", () => {
  const hellos = (plane: ReturnType<typeof fakeControlPlane>) =>
    plane.received.filter((message) => message.type === "hello");
  const ended = (plane: ReturnType<typeof fakeControlPlane>) =>
    plane.received.filter((message) => message.type === "run.end");
  const appended = (plane: ReturnType<typeof fakeControlPlane>) =>
    plane.received.flatMap((message) =>
      message.type === "call" && message.method === "memory.append"
        ? [message.params as { turn: number; messages: { role: string }[] }]
        : [],
    );

  test("a run reports its progress as events and hands its messages home", async () => {
    const { sandbox, up } = slowSandbox();
    up();
    const lookup = createTool({
      name: "lookup",
      description: "Looks something up",
      inputSchema: z.object({ key: z.string() }),
      execute: ({ key }) => `value of ${key}`,
    });
    const { plane, runtime } = connect({
      sandbox,
      createAgent: ({ id }) => ({
        agent: new Agent({
          id,
          instructions: "x",
          tools: [lookup],
          model: scriptedModel([
            [text("looking"), toolCall("lookup", { key: "a" }, "call-1")],
            [text("found it")],
          ]),
        }),
      }),
    });
    await runtime.ready;
    plane.send(runStart);

    await until(() => ended(plane).length === 1);
    expect(ended(plane)[0]).toMatchObject({ outcome: "response" });
    const events = plane.received.flatMap((m) => (m.type === "run.event" ? [m.event] : []));
    expect(events.map((event) => event.type)).toEqual([
      "text",
      "tool_start",
      "usage",
      "tool_end",
      "text",
      "usage",
    ]);
    expect(events.find((event) => event.type === "tool_end")).toMatchObject({
      id: "call-1",
      status: "done",
      output: "value of a",
    });
    // The prompt, the assistant's turn, the tool's result and the final reply.
    const [transcript] = appended(plane);
    expect(transcript?.turn).toBe(0);
    expect(transcript?.messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "tool",
      "assistant",
    ]);
  });

  test("attached files go to /uploads, and an image is shown to the model and kept for the transcript", async () => {
    const sandbox = directoryWorkspaces();
    cleanups.push(() => sandbox.dispose());
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    const pdf = new TextEncoder().encode("%PDF-1.7 hello");
    const image = `${crypto.randomUUID()}.png`;
    let asked: CompletionRequest | undefined;
    const { plane, runtime } = connect({
      sandbox,
      createAgent: agentThat((request) => {
        asked = request;
        return [text("seen")];
      }),
    });
    await runtime.ready;
    plane.send({
      ...runStart,
      prompt: "what is in these?",
      attachments: [
        {
          name: "chart.png",
          mediaType: "image/png",
          size: png.length,
          image,
          data: png.toBase64(),
        },
        {
          name: "Q3 report.pdf",
          mediaType: "application/pdf",
          size: pdf.length,
          data: pdf.toBase64(),
        },
      ],
    });

    await until(() => ended(plane).length === 1);
    expect(ended(plane)[0]).toMatchObject({ outcome: "response" });
    const uploads = join(sandbox.uploads.root, thread.id);
    expect(new Uint8Array(await Bun.file(join(uploads, "chart.png")).arrayBuffer())).toEqual(png);
    expect(await Bun.file(join(uploads, "Q3_report.pdf")).text()).toBe("%PDF-1.7 hello");
    expect(await sandbox.artifacts.read(thread.id, image)).toEqual({
      mediaType: "image/png",
      data: png.toBase64(),
    });

    // The model gets the text, where the files are, and the image itself.
    const prompt = asked?.chatHistory.find((message) => message.role === "user");
    const content = Array.isArray(prompt?.content) ? prompt.content : [];
    expect(content[0]).toEqual({ type: "text", text: "what is in these?" });
    const note = content[1]?.type === "text" ? content[1].text : "";
    expect(note).toContain("/uploads/chart.png (image/png, 11 B, shown to you below)");
    expect(note).toContain("/uploads/Q3_report.pdf (application/pdf, 14 B)");
    expect(content[2]).toMatchObject({
      type: "image",
      image: { type: "data", data: png.toBase64() },
    });

    // The transcript keeps the message as it was sent, for the client to show.
    const [transcript] = appended(plane);
    const user = transcript?.messages[0] as { metadata?: unknown } | undefined;
    expect(user?.metadata).toEqual({
      prompt: "what is in these?",
      attachments: [
        { name: "chart.png", mediaType: "image/png", size: 11, image },
        { name: "Q3 report.pdf", mediaType: "application/pdf", size: 14 },
      ],
    });
  });

  test("a question parks the run, and the answer finishes it with only what is new", async () => {
    const { sandbox, up } = slowSandbox();
    up();
    const { plane, runtime } = connect({
      sandbox,
      createAgent: ({ id }) => ({
        agent: new Agent({
          id,
          instructions: "x",
          tools: [createQuestionTool()],
          // One agent for the whole exchange: the run that answers continues the asking run's.
          model: scriptedModel([
            [
              {
                type: "tool-call",
                toolCallId: "q1",
                toolName: "ask_user",
                input: { questions: [{ id: "color", text: "Which color?" }] },
              },
            ],
            [text("Going with red")],
          ]),
        }),
      }),
    });
    await runtime.ready;
    plane.send(runStart);

    await until(() => ended(plane).length === 1);
    const asked = ended(plane)[0];
    expect(asked).toMatchObject({ outcome: "interaction" });
    const continuation = asked && "continuation" in asked ? asked.continuation : undefined;
    expect(continuation).toBeDefined();

    plane.send({
      type: "run.resume",
      runId: "run-2",
      thread,
      continuation,
      response: { type: "tool-question", answers: [{ questionId: "color", value: "red" }] },
    });
    await until(() => ended(plane).length === 2);
    expect(ended(plane)[1]).toMatchObject({ runId: "run-2", outcome: "response" });
    const [first, second] = appended(plane);
    expect(first?.turn).toBe(0);
    expect(second?.turn).toBe(first?.messages.length);
    expect(second?.messages.at(-1)?.role).toBe("assistant");
  });

  test("a goal the agent defines is worked after its turn, and the run ends with the agent's report", async () => {
    const { sandbox, up } = slowSandbox();
    up();
    const scripts: Record<string, ScriptStep[]> = {
      "run-run-1": [
        [
          text("Starting a goal. "),
          {
            type: "tool-call",
            toolCallId: "g1",
            toolName: "define_goal",
            input: { objective: "Add paging", acceptanceCriteria: ["it pages"] },
          },
        ],
        [text("Goal started.")],
      ],
      "goal-run-1": [[text("Paging added.")]],
      "run-run-1-report": [[text("All done, paging works.")]],
    };
    const made: { id: string; attended: boolean; tools: string[] }[] = [];
    const { plane, runtime } = connect({
      sandbox,
      createAgent: ({ id, attended, tools }) => {
        made.push({ id, attended, tools: tools.map((tool) => tool.name) });
        return {
          agent: new Agent({
            id,
            instructions: "x",
            tools: [...tools],
            model: scriptedModel(scripts[id] ?? []),
          }),
        };
      },
    });
    await runtime.ready;
    plane.send(runStart);

    await until(() => ended(plane).length === 1);
    expect(ended(plane)[0]).toMatchObject({ outcome: "response" });

    // Only the agent with a person to talk to may define a goal, and only it may ask questions.
    expect(made).toEqual([
      { id: "run-run-1", attended: true, tools: ["define_goal"] },
      { id: "goal-run-1", attended: false, tools: [] },
      { id: "run-run-1-report", attended: false, tools: [] },
    ]);
    const texts = plane.received.flatMap((m) =>
      m.type === "run.event" && m.event.type === "text" ? [m.event.delta] : [],
    );
    expect(texts).toEqual([
      "Starting a goal. ",
      "Goal started.",
      goalSessionMarker(1),
      "Paging added.",
      "All done, paging works.",
    ]);

    // What the user reads: the prompt, the agent's turn, the goal's work and the report. The notes
    // Aven wrote to the agent are not in it.
    const roles = appended(plane).flatMap((append) =>
      append.messages.map((message) => message.role),
    );
    // The session's divider is an assistant message of its own.
    expect(roles).toEqual([
      "user",
      "assistant",
      "tool",
      "assistant",
      "assistant",
      "assistant",
      "assistant",
    ]);
  });

  test("a cancel while the goal is working stops it and ends the run", async () => {
    const { sandbox, up } = slowSandbox();
    up();
    const working = Promise.withResolvers<void>();
    const hold = Promise.withResolvers<void>();
    const scripts: Record<string, ScriptStep[]> = {
      "run-run-1": [
        [
          {
            type: "tool-call",
            toolCallId: "g1",
            toolName: "define_goal",
            input: { objective: "Add paging", acceptanceCriteria: ["it pages"] },
          },
        ],
        [text("Goal started.")],
      ],
      "goal-run-1": [
        async () => {
          working.resolve();
          await hold.promise;
          return [text("never")];
        },
      ],
    };
    const { plane, runtime } = connect({
      sandbox,
      createAgent: ({ id, tools }) => ({
        agent: new Agent({
          id,
          instructions: "x",
          tools: [...tools],
          model: scriptedModel(scripts[id] ?? []),
        }),
      }),
    });
    await runtime.ready;
    plane.send(runStart);
    await working.promise;

    plane.send({ type: "run.cancel", runId: "run-1", reason: "Cancelled by user" });
    hold.resolve();
    await until(() => ended(plane).length === 1);
    expect(ended(plane)[0]).toMatchObject({ outcome: "error", error: "Cancelled by user" });
  });

  test("a goal from a run that failed to file its transcript is not started by the next run", async () => {
    const { sandbox, up } = slowSandbox();
    up();
    const made: string[] = [];
    const { plane, runtime } = connect({
      sandbox,
      callTimeoutMs: 100,
      createAgent: ({ id, tools }) => {
        made.push(id);
        const steps: ScriptStep[] =
          id === "run-run-1"
            ? [
                [
                  {
                    type: "tool-call",
                    toolCallId: "g1",
                    toolName: "define_goal",
                    input: { objective: "Add paging", acceptanceCriteria: ["it pages"] },
                  },
                ],
                [text("Goal started.")],
              ]
            : [[text("hello")]];
        return {
          agent: new Agent({
            id,
            instructions: "x",
            tools: [...tools],
            model: scriptedModel(steps),
          }),
        };
      },
    });
    await runtime.ready;
    plane.transcripts.stored = false;
    plane.send(runStart);
    await until(() => ended(plane).length === 1);
    expect(ended(plane)[0]).toMatchObject({ outcome: "error" });

    plane.transcripts.stored = true;
    plane.send({ ...runStart, runId: "run-2" });
    await until(() => ended(plane).length === 2);
    expect(ended(plane)[1]).toMatchObject({ outcome: "response" });
    expect(made).toEqual(["run-run-1", "run-run-2"]);
  });

  describe("when the connection drops", () => {
    test("a run keeps working, and the control plane gets what it missed when it asks", async () => {
      const { sandbox, up } = slowSandbox();
      up();
      const hold = Promise.withResolvers<void>();
      const { plane, runtime } = connect({
        sandbox,
        createAgent: ({ id }) => ({
          agent: new Agent({
            id,
            instructions: "x",
            model: scriptedModel([
              async () => {
                await hold.promise;
                return [text("finished while away")];
              },
            ]),
          }),
        }),
      });
      await runtime.ready;
      plane.send(runStart);
      // The run is under way: the model holds the first reply back.
      await Bun.sleep(100);
      const before = plane.received.length;

      plane.drop();
      hold.resolve();
      // The run finishes with nobody listening; the runner reconnects and says what it holds.
      await until(() => hellos(plane).length === 2);
      expect(hellos(plane)[1]).toMatchObject({ runs: ["run-1"] });
      // Nothing about the run is sent until it is asked for.
      await Bun.sleep(100);
      expect(plane.received.slice(before).filter((m) => m.type === "run.end")).toEqual([]);

      plane.send({ type: "run.attach", runId: "run-1", after: 0 });
      await until(() => ended(plane).length === 1);
      expect(ended(plane)[0]).toMatchObject({ outcome: "response", seq: 3 });
      const seqs = plane.received.flatMap((m) =>
        m.type === "run.event" || m.type === "run.end" ? [m.seq] : [],
      );
      expect(seqs).toEqual([1, 2, 3]);

      // Once the end is acknowledged the run is forgotten.
      plane.send({ type: "run.ack", runId: "run-1" });
      plane.drop();
      await until(() => hellos(plane).length === 3);
      expect(hellos(plane)[2]).toMatchObject({ runs: [] });
    });
  });

  describe("when the runner restarts", () => {
    test("the run it was working on goes on from where it stopped, without repeating what it did", async () => {
      const { sandbox, up } = slowSandbox();
      up();
      let lookups = 0;
      const lookup = createTool({
        name: "lookup",
        description: "Looks something up",
        inputSchema: z.object({ key: z.string() }),
        execute: ({ key }) => `value of ${++lookups} for ${key}`,
      });
      const hold = Promise.withResolvers<void>();
      const reached = Promise.withResolvers<void>();
      const paths = { journalPath: journalPath() };

      const first = connect({
        sandbox,
        ...paths,
        createAgent: ({ id }) => ({
          agent: new Agent({
            id,
            instructions: "x",
            tools: [lookup],
            model: scriptedModel([
              [text("looking. "), toolCall("lookup", { key: "a" }, "call-1")],
              async () => {
                reached.resolve();
                await hold.promise;
                return [text("never")];
              },
            ]),
          }),
        }),
      });
      await first.runtime.ready;
      first.plane.send(runStart);
      await reached.promise;
      await until(() => first.plane.received.some((m) => m.type === "run.event"));
      const heard = first.plane.received.flatMap((m) => (m.type === "run.event" ? [m.seq] : []));

      // The runner stops with the run half done.
      const stopping = first.runtime.stop();
      hold.resolve();
      await stopping;

      // A new runner on the same files. The control plane has the first events and asks for the rest.
      const second = connect({
        sandbox,
        ...paths,
        createAgent: ({ id }) => ({
          agent: new Agent({
            id,
            instructions: "x",
            tools: [lookup],
            model: scriptedModel([[text("all done")]]),
          }),
        }),
      });
      await second.runtime.ready;
      await until(() => hellos(second.plane).length === 1);
      expect(hellos(second.plane)[0]).toMatchObject({ runs: ["run-1"] });
      second.plane.send({ type: "run.attach", runId: "run-1", after: Math.max(...heard) });

      await until(() => ended(second.plane).length === 1);
      expect(ended(second.plane)[0]).toMatchObject({ outcome: "response" });
      // What the first runner did is not done again, and the numbering carries on.
      expect(lookups).toBe(1);
      const seqs = second.plane.received.flatMap((m) =>
        m.type === "run.event" || m.type === "run.end" ? [m.seq] : [],
      );
      expect(seqs[0]).toBeGreaterThan(Math.max(...heard));
      expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
      const texts = second.plane.received.flatMap((m) =>
        m.type === "run.event" && m.event.type === "text" ? [m.event.delta] : [],
      );
      expect(texts).toEqual(["all done"]);

      // Acknowledged, it is forgotten for good.
      second.plane.send({ type: "run.ack", runId: "run-1" });
      second.plane.drop();
      await until(() => hellos(second.plane).length === 2);
      expect(hellos(second.plane)[1]).toMatchObject({ runs: [] });
    });

    test("a run the control plane no longer follows is stopped, and said to have ended", async () => {
      const { sandbox, up } = slowSandbox();
      up();
      const hold = Promise.withResolvers<void>();
      const reached = Promise.withResolvers<void>();
      const paths = { journalPath: journalPath() };
      const make: CreateRuntimeAgent = ({ id }) => ({
        agent: new Agent({
          id,
          instructions: "x",
          model: scriptedModel([
            async () => {
              reached.resolve();
              await hold.promise;
              return [text("never")];
            },
          ]),
        }),
      });
      const first = connect({ sandbox, ...paths, createAgent: make });
      await first.runtime.ready;
      first.plane.send(runStart);
      await reached.promise;
      const stopping = first.runtime.stop();
      hold.resolve();
      await stopping;

      const second = connect({ sandbox, ...paths, createAgent: make });
      await until(() => hellos(second.plane).length === 1);
      second.plane.send({ type: "run.cancel", runId: "run-1", reason: "Not followed" });
      await until(() => ended(second.plane).length === 1);
      expect(ended(second.plane)[0]).toMatchObject({ outcome: "error", error: "Not followed" });
    });

    test("a goal goes on from the session it was in, and is checked and reported as usual", async () => {
      const { sandbox: base, up } = slowSandbox();
      up();
      // The goal's check fails after the first session and passes after the second.
      let checks = 0;
      const exec = createTool({
        name: "exec_command",
        description: "run",
        inputSchema: z.object({ command: z.string(), timeoutMs: z.number().optional() }),
        execute: () => ({
          status: "exited",
          exitCode: ++checks === 1 ? 1 : 0,
          stdout: "",
          stderr: checks === 1 ? "1 failed" : "",
        }),
      });
      const sandbox: ThreadWorkspaces = {
        ...base,
        acquire: async () => ({ tools: [exec], hasRunningProcesses: async () => false }),
      };
      const hold = Promise.withResolvers<void>();
      const secondSession = Promise.withResolvers<void>();
      const paths = { journalPath: journalPath() };
      const defineGoal: ScriptStep = [
        {
          type: "tool-call",
          toolCallId: "g1",
          toolName: "define_goal",
          input: {
            objective: "Add paging",
            acceptanceCriteria: ["it pages"],
            verifyCommands: ["bun test"],
          },
        },
      ];

      const first = connect({
        sandbox,
        ...paths,
        createAgent: ({ id, tools }) => {
          const steps: ScriptStep[] =
            id === "run-run-1"
              ? [defineGoal, [text("Goal started.")]]
              : [
                  [text("session one done")],
                  async () => {
                    secondSession.resolve();
                    await hold.promise;
                    return [text("never")];
                  },
                ];
          return {
            agent: new Agent({
              id,
              instructions: "x",
              tools: [...tools],
              model: scriptedModel(steps),
            }),
          };
        },
      });
      await first.runtime.ready;
      first.plane.send(runStart);
      await secondSession.promise;
      // Everything up to the second session's divider reached the control plane.
      await until(() =>
        first.plane.received.some(
          (m) =>
            m.type === "run.event" &&
            m.event.type === "text" &&
            m.event.delta === goalSessionMarker(2),
        ),
      );
      const heard = first.plane.received.flatMap((m) => (m.type === "run.event" ? [m.seq] : []));

      const stopping = first.runtime.stop();
      hold.resolve();
      await stopping;

      const second = connect({
        sandbox,
        ...paths,
        createAgent: ({ id, tools }) => ({
          agent: new Agent({
            id,
            instructions: "x",
            tools: [...tools],
            model: scriptedModel(
              id.endsWith("-report")
                ? [[text("All checked, paging works.")]]
                : [[text("session two done")]],
            ),
          }),
        }),
      });
      await until(() => hellos(second.plane).length === 1);
      expect(hellos(second.plane)[0]).toMatchObject({ runs: ["run-1"] });
      second.plane.send({ type: "run.attach", runId: "run-1", after: Math.max(...heard) });

      await until(() => ended(second.plane).length === 1);
      expect(ended(second.plane)[0]).toMatchObject({ outcome: "response" });
      const texts = second.plane.received.flatMap((m) =>
        m.type === "run.event" && m.event.type === "text" ? [m.event.delta] : [],
      );
      // The second session and the report: the first session, and the dividers, were told before.
      expect(texts).toEqual(["session two done", "All checked, paging works."]);
      expect(checks).toBe(2);
      const filed = second.plane.received.flatMap((m) =>
        m.type === "call" && m.method === "memory.append"
          ? [(m.params as { messages: { role: string }[] }).messages.length]
          : [],
      );
      // The second session (its divider and its reply), then the report.
      expect(filed).toEqual([2, 1]);
    });
  });
});
