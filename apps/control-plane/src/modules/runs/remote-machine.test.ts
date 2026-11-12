import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { db } from "@aven/db/client";
import { HostSandboxes } from "@aven/runtime-client/host-sandboxes";
import { startRuntime } from "@aven/runtime-client/runner";
import { journalPath } from "@aven/runtime-client/testing/journal-path";
import { createRemoteRepo } from "@aven/runtime-client/testing/remote-repo";
import { Elysia } from "elysia";

import { createMemoryStore } from "../../memory-store";
import {
  memoryContinuations,
  memoryFailures,
  memorySenders,
  memoryWorkedTimes,
} from "../../testing/memory-continuations";
import { seedOrgPair } from "../../testing/seed-org-pair";
import { seedProject } from "../../testing/seed-project";
import { connectRouter } from "../runtimes/connect";
import { RunGateway } from "../runtimes/gateway";
import { RuntimeHub } from "../runtimes/hub";
import { reachRunner } from "../runtimes/providers";
import { LOCAL_RUNTIME_ID, runtimesService } from "../runtimes/service";
import { createThreadForks } from "../threads/forks";
import { threadsService } from "../threads/service";
import { RemoteRuntime } from "./remote-runtime";
import { RunManager } from "./service";

const run = process.env.DATABASE_URL ? describe : describe.skip;

const sse = (events: [string, unknown][]) =>
  events.map(([name, data]) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`).join("");

const opening = {
  type: "message_start",
  message: {
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-5",
    content: [],
    stop_reason: null,
    usage: { input_tokens: 10, output_tokens: 1 },
  },
};

const tool = (name: string, input: unknown) =>
  sse([
    ["message_start", opening],
    [
      "content_block_start",
      {
        type: "content_block_start",
        index: 0,
        content_block: {
          type: "tool_use",
          id: `toolu_${crypto.randomUUID().slice(0, 8)}`,
          name,
          input: {},
        },
      },
    ],
    [
      "content_block_delta",
      {
        type: "content_block_delta",
        index: 0,
        delta: { type: "input_json_delta", partial_json: JSON.stringify(input) },
      },
    ],
    ["content_block_stop", { type: "content_block_stop", index: 0 }],
    [
      "message_delta",
      {
        type: "message_delta",
        delta: { stop_reason: "tool_use", stop_sequence: null },
        usage: { output_tokens: 5 },
      },
    ],
    ["message_stop", { type: "message_stop" }],
  ]);

const toolCall = (command: string) => tool("exec_command", { command });

const FORK_MARK = "FORK-AND-TAKE";
const FORK_TITLE = "Write the file";

const hasToolResult = (body: string) => {
  const content = JSON.parse(body).messages.at(-1).content;
  return (
    Array.isArray(content) && content.some((part: { type?: string }) => part.type === "tool_result")
  );
};

const forkIdFrom = (body: string) => {
  const text = JSON.stringify(JSON.parse(body).messages);
  return (
    /"id":"([0-9a-f-]{36})","title":"Write the file"/.exec(text)?.[1] ??
    /\\"id\\":\\"([0-9a-f-]{36})\\",\\"title\\":\\"Write the file\\"/.exec(text)?.[1]
  );
};

const parentForkReply = (body: string) => {
  if (body.includes(".git/aven-forks/")) return answer("taken");

  const id = forkIdFrom(body);

  if (body.includes("forks have stopped") && id) return tool("take_fork_changes", { id });

  if (body.includes("The fork is working") && id) {
    return tool("wait_for_forks", { ids: [id], timeoutSeconds: 30 });
  }

  if (hasToolResult(body)) {
    return tool("fork_thread", {
      task: "Create fork.txt containing from-fork.",
      context: "The parent workspace is already prepared.",
      title: FORK_TITLE,
    });
  }

  return toolCall("echo parent > parent.txt");
};

const scripted = (body: string) => {
  if (body.includes("You are a fork of the thread")) {
    return hasToolResult(body) ? answer("wrote fork.txt") : toolCall("echo from-fork > fork.txt");
  }

  if (body.includes(FORK_MARK)) return parentForkReply(body);

  const command = body.includes("please sleep")
    ? "echo up > ready; sleep 30"
    : "pwd; echo made > proof.txt";
  return hasToolResult(body) ? answer("done") : toolCall(command);
};

const answer = (text: string) =>
  sse([
    ["message_start", opening],
    [
      "content_block_start",
      { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    ],
    [
      "content_block_delta",
      { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } },
    ],
    ["content_block_stop", { type: "content_block_stop", index: 0 }],
    [
      "message_delta",
      {
        type: "message_delta",
        delta: { stop_reason: "end_turn", stop_sequence: null },
        usage: { output_tokens: 5 },
      },
    ],
    ["message_stop", { type: "message_stop" }],
  ]);

run(
  "an agent on the control plane whose computer is another machine (real postgres, real runners)",
  async () => {
    const seed = await seedOrgPair();
    const store = createMemoryStore(db);
    const { access } = await createRemoteRepo();
    const hub = new RuntimeHub(store, async () => access);
    hub.machines = { reach: (place) => reachRunner(hub, place, "The computer is offline") };
    const threadId = crypto.randomUUID();
    const bodies: string[] = [];

    const provider = Bun.serve({
      port: 0,
      async fetch(req) {
        const body = await req.text();
        bodies.push(body);
        return new Response(scripted(body), { headers: { "content-type": "text/event-stream" } });
      },
    });
    const pointed = new RunGateway({
      anthropic: `http://localhost:${provider.port}`,
      openai: `http://localhost:${provider.port}/v1`,
    });
    const controlPlane = new Elysia()
      .use(connectRouter(hub))
      .all(
        "/runtimes/gateway/:segment/*",
        ({ request, params }) => pointed.forward(request, params.segment, params["*"]),
        { parse: "none" },
      )
      .listen({ port: 0 });
    const url = `ws://localhost:${controlPlane.server?.port}/connect`;

    const homes = await Promise.all(
      ["host", "machine"].map((name) => mkdtemp(join(tmpdir(), `aven-${name}-`))),
    );
    const [hostHome, machineHome] = homes as [string, string];
    await runtimesService.ensureLocal();
    const host = startRuntime({
      url,
      token: runtimesService.localToken,
      sandbox: await HostSandboxes.start({ home: hostHome }),
      journalPath: journalPath(),
    });
    const { runtime: machine, token } = await runtimesService.create(seed.orgA, seed.userId, {
      name: "remote machine",
    });
    const machineSandbox = await HostSandboxes.start({ home: machineHome });
    let machineRunner = startRuntime({
      url,
      token,
      sandbox: machineSandbox,
      journalPath: journalPath(),
    });

    afterAll(async () => {
      await host.stop();
      await machineRunner.stop();
      hub.closeAll();
      await controlPlane.stop(true);
      provider.stop(true);
      await store.clear({
        scope: { sessionId: threadId, metadata: { organizationId: seed.orgA } },
      });
      await seed.cleanup();
      await Promise.all(homes.map((home) => rm(home, { recursive: true, force: true })));
    });

    const failures = memoryFailures();
    const manager = new RunManager({
      store,
      runtime: new RemoteRuntime(hub, pointed),
      onRunFinished: () => undefined,
      continuations: memoryContinuations().store,
      failures: failures.store,
      workedTimes: memoryWorkedTimes().store,
      senders: memorySenders().store,
    });
    const thread = { id: threadId, organizationId: seed.orgA, runtimeId: machine.id };
    const model = { provider: "anthropic", modelId: "claude-sonnet-5", apiKey: "sk-key" } as const;
    hub.forks = createThreadForks({
      runs: manager,
      messages: {
        async start(organizationId, _userId, threadId, { prompt }) {
          const forked = await threadsService.require(organizationId, threadId);
          await manager.start(forked, prompt, model);
        },
        async send() {
          return { steered: false };
        },
      },
    });

    const until = async (check: () => boolean, ms = 15_000) => {
      const deadline = Date.now() + ms;
      while (!check()) {
        if (Date.now() > deadline) throw new Error("timed out");

        await Bun.sleep(25);
      }
    };
    const toolResultOf = (body: string | undefined) =>
      JSON.stringify(JSON.parse(body ?? "{}").messages.at(-1).content);

    test("the agent runs on the control plane's runner and its command runs on the machine", async () => {
      await Promise.all([host.ready, machineRunner.ready]);
      await until(() => hub.isOnline(LOCAL_RUNTIME_ID) && hub.isOnline(machine.id));

      await manager.start(thread, "make a file", model);
      await until(() => !manager.isRunning(thread.id) && bodies.length === 2);

      const workspace = machineSandbox.paths(thread.id).workspace;
      expect(await readFile(join(workspace, "proof.txt"), "utf8")).toBe("made\n");
      expect(toolResultOf(bodies[1])).toContain(workspace);
      expect(toolResultOf(bodies[1])).not.toContain(hostHome);
      expect(JSON.stringify(await manager.history(thread))).toContain("done");
    });

    test("with the machine offline the run still starts and ends, with its file kept, and the agent is told why its tool failed", async () => {
      await machineRunner.stop();
      await until(() => !hub.isOnline(machine.id));
      const before = bodies.length;

      await manager.start(thread, "again", model, {
        skills: [{ name: "notes", description: "Take notes.", digest: "1".repeat(64) }],
        attachments: [
          {
            name: "notes.txt",
            mediaType: "text/plain",
            size: 5,
            data: new TextEncoder().encode("hello").toBase64(),
          },
        ],
      });
      await until(() => !manager.isRunning(thread.id) && bodies.length === before + 2);

      const uploads = machineSandbox.paths(thread.id).uploads;
      expect(bodies[before]).toContain("waiting to be written");
      expect(bodies[before]).toMatch(/notes-[0-9a-f]{4}\.txt/);
      expect(bodies[before]).not.toContain(`${uploads}/notes-`);
      expect(bodies[before]).not.toContain("/uploads/notes-");
      expect(toolResultOf(bodies[before + 1])).toContain("The computer is offline");
      expect(bodies[before]).toContain("could not be loaded");
      expect(bodies[before]).toContain("notes");
      machineRunner = startRuntime({
        url,
        token,
        sandbox: machineSandbox,
        journalPath: journalPath(),
      });
    }, 30_000);

    test("a file kept while the machine was offline is written there when the agent next reaches it", async () => {
      await machineRunner.ready;
      await until(() => hub.isOnline(machine.id));
      const before = bodies.length;

      await manager.start(thread, "once more", model);
      await until(() => !manager.isRunning(thread.id) && bodies.length === before + 2);

      const uploads = machineSandbox.paths(thread.id).uploads;
      const kept = (await readdir(uploads)).filter((name) => name.startsWith("notes-"));
      expect(kept).toHaveLength(1);
      expect(await readFile(join(uploads, kept[0]!), "utf8")).toBe("hello");
      expect(toolResultOf(bodies[before + 1])).toContain(`${uploads}/${kept[0]}`);
    }, 30_000);

    test("an agent forks onto the machine and takes the fork's changes back", async () => {
      await machineRunner.ready;
      await until(() => hub.isOnline(LOCAL_RUNTIME_ID) && hub.isOnline(machine.id));
      const { project } = await seedProject(seed.orgA, seed.userId, machine.id, "fork-app");
      const parent = await threadsService.create(seed.orgA, seed.userId, {
        projectId: project.id,
        title: "Parent",
      });
      const before = bodies.length;

      await manager.start(parent, FORK_MARK, model);
      const deadline = Date.now() + 50_000;
      while (manager.isRunning(parent.id) || bodies.length < before + 5) {
        if (!manager.isRunning(parent.id) && bodies.length > before && bodies.length < before + 5) {
          throw new Error(`the parent run ended early: ${bodies.at(-1)?.slice(-1200)}`);
        }

        if (Date.now() > deadline) {
          throw new Error(`timed out waiting for the fork: ${bodies.at(-1)?.slice(-1200)}`);
        }

        await Bun.sleep(25);
      }

      const workspace = machineSandbox.paths(parent.id).workspace;
      const patchName = (await readdir(join(workspace, ".git", "aven-forks")))[0];
      const patch = await readFile(join(workspace, ".git", "aven-forks", patchName!), "utf8");
      expect(patch).toContain("+from-fork");
      expect(patch).toContain("fork.txt");
      expect(await readFile(join(workspace, "parent.txt"), "utf8")).toBe("parent\n");
      expect(await Bun.file(join(workspace, "fork.txt")).exists()).toBe(false);

      const wrote = [];
      for (const id of await readdir(join(machineHome, "workspaces"))) {
        if (id === parent.id) continue;

        const file = join(machineHome, "workspaces", id, "fork.txt");

        if (await Bun.file(file).exists()) wrote.push(file);
      }
      expect(wrote).toHaveLength(1);
      expect(await readFile(wrote[0]!, "utf8")).toBe("from-fork\n");
      expect(JSON.stringify(await manager.history(parent))).toContain("taken");
    }, 60_000);

    test("cancelling the run stops the command that is running on the machine", async () => {
      await machineRunner.ready;
      await until(() => hub.isOnline(LOCAL_RUNTIME_ID) && hub.isOnline(machine.id));
      const started = Date.now();
      await manager.start(thread, "please sleep", model);
      const ready = join(machineSandbox.paths(thread.id).workspace, "ready");
      const deadline = Date.now() + 15_000;
      let wrote = false;
      while (!wrote && Date.now() < deadline) {
        try {
          wrote = (await readFile(ready, "utf8")).includes("up");
        } catch {
          await Bun.sleep(25);
        }
      }
      expect(wrote).toBe(true);

      expect(manager.cancel(thread.id)).toBe(true);
      await until(() => !manager.isRunning(thread.id), 10_000);
      expect(Date.now() - started).toBeLessThan(20_000);
      const listing = await new Response(
        Bun.spawn(["ps", "-eo", "args"], { stdout: "pipe" }).stdout,
      ).text();
      expect(listing).not.toContain("echo up > ready");
    }, 25_000);
  },
);
