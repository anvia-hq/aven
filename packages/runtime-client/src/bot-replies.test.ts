import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Agent, createTool, type AnyTool } from "@anvia/core";
import { scriptedModel, text, toolCall } from "@aven/agents/testing/scripted-model";
import { createCreateBotTool } from "@aven/agents/tools/create-bot";
import { createAskQuestionTool } from "@aven/agents/tools/ask-question";
import { createSendMessageTool } from "@aven/agents/tools/send-message";
import { createUpdateSelfTool } from "@aven/agents/tools/update-self";
import { z } from "zod";

import { BotReplies, defaultCreateBotAgent } from "./bot-replies";
import { ArtifactStore } from "./artifacts";
import { noProcesses } from "./thread-processes";
import { SkillStore } from "./skills";
import { UploadStore } from "./uploads";
import type { McpNote, SkillListing } from "@aven/agents/types";
import type { CreateBot } from "@aven/agents/tools/types";
import type { RunAttachment, RuntimeToControlPlane } from "@aven/protocol/types";
import type {
  BotReplyMessage,
  CreateBotReplyAgent,
  ThreadSandbox,
  ThreadWorkspaces,
} from "./types";

const tool = (name: string): AnyTool =>
  createTool({ name, description: name, inputSchema: z.object({}), execute: async () => "ok" });

const model = { provider: "openai", gatewayPath: "/g", gatewayToken: "t" } as const;
const message: BotReplyMessage = {
  type: "bot.reply",
  replyId: "r1",
  bot: {
    id: "bot-1",
    name: "Pip",
    handle: "pip",
    instruction: "",
    description: "A pal.",
    canCreateBots: false,
    peers: [],
    timezone: "Asia/Jakarta",
  },
  prompt: "hello",
  model,
};

const makingBots = (createBot?: CreateBot) => (createBot ? [createCreateBotTool(createBot)] : []);

const agentThat =
  (...steps: Parameters<typeof scriptedModel>[0]): CreateBotReplyAgent =>
  ({ send, computer, memory, createBot, updateSelf }) =>
    new Agent({
      id: "bot",
      model: scriptedModel([...steps, [text("")]]),
      instructions: "x",
      memory,
      tools: [
        createSendMessageTool(send),
        ...computer,
        ...makingBots(createBot),
        createUpdateSelfTool(updateSelf),
      ],
    });

type Exec = (command: string) => unknown;
const exec = (
  run: Exec = () => ({ status: "exited", exitCode: 0, stdout: "ok", stderr: "" }),
): AnyTool =>
  createTool({
    name: "exec_command",
    description: "run",
    inputSchema: z.object({ command: z.string(), timeoutMs: z.number().optional() }),
    execute: async ({ command }) => run(command),
  });

const sandboxWith = (
  acquired: { id: string; repo: unknown }[] = [],
  run?: Exec,
  stores: Pick<ThreadWorkspaces, "uploads" | "artifacts" | "skills"> = {},
): ThreadWorkspaces => ({
  ...stores,
  async acquire(thread, repo) {
    acquired.push({ id: thread.id, repo });
    return {
      tools: [exec(run), tool("show_artifact")],
      hasRunningProcesses: async () => false,
      processes: noProcesses,
    };
  },
  workspace: async () => undefined,
  release: async () => undefined,
  dispose: async () => undefined,
});

const memoryAnswer = (params: unknown) => ((params as { op?: string }).op === "load" ? [] : null);

function harness(
  createAgent: CreateBotReplyAgent,
  options: {
    linkUp?: () => boolean;
    failSend?: boolean;
    exec?: Exec;
    stores?: Pick<ThreadWorkspaces, "uploads" | "artifacts" | "skills">;
    archives?: Map<string, Uint8Array>;
    machines?: ThreadWorkspaces;
  } = {},
) {
  const sent: RuntimeToControlPlane[] = [];
  const calls: unknown[] = [];
  const acquired: { id: string; repo: unknown }[] = [];
  const finished: string[] = [];
  const pauses: number[] = [];
  const boxes = new Map<string, ThreadSandbox>();
  const replies = new BotReplies({
    sandbox: sandboxWith(acquired, options.exec, options.stores),
    machines: options.machines,
    createAgent,
    send: (frame) => {
      if (options.linkUp && !options.linkUp()) return false;
      sent.push(frame);
      return true;
    },
    call: async (method, params) => {
      calls.push({ method, params });
      if (method === "bot.create") {
        const { name } = params as { name: string };
        return { id: "b2", name, handle: name.toLowerCase() };
      }
      if (method === "bot.send") {
        if (options.failSend) throw new Error('No bot with the handle "ghost"');
        return { handle: "scout", name: "Scout" };
      }
      if (method === "bot.update") return { name: "Pip", description: "Now for research." };
      if (method === "bot.goal") return null;
      if (method === "bot.skill") {
        const archive = options.archives?.get((params as { digest: string }).digest);
        if (!archive) throw new Error("This reply has no such skill");
        return { data: archive.toBase64() };
      }
      return memoryAnswer(params);
    },
    boxes,
    starting: async () => undefined,
    finished: (botId) => void finished.push(botId),
    pause: async (ms) => void pauses.push(ms),
  });
  const ended = () => sent.some((frame) => frame.type === "bot.end");
  const until = async () => {
    for (let i = 0; i < 100 && !ended(); i++) await Bun.sleep(10);
  };
  return { replies, sent, calls, acquired, finished, pauses, boxes, until };
}

describe("BotReplies", () => {
  describe("the person's skills (decision 0081)", () => {
    const root = mkdtemp(join(tmpdir(), "aven-bot-skills-"));
    afterAll(async () => rm(await root, { recursive: true, force: true }));
    const skillMd = (name: string, description: string) =>
      `---\nname: ${name}\ndescription: ${description}\n---\nSteps.`;
    const archive = (name: string, description: string) =>
      new Bun.Archive({ "SKILL.md": skillMd(name, description) }, { compress: "gzip" }).bytes();
    const stores = async () => ({
      skills: new SkillStore(join(await root, `skills-${crypto.randomUUID()}`)),
    });

    const notes = { name: "notes", description: "Personal notes.", digest: "1".repeat(64) };
    const lint = { name: "lint", description: "Built-in lint.", digest: "2".repeat(64) };

    const answered = async (
      skills: BotReplyMessage["skills"],
      archives: Map<string, Uint8Array>,
      held: Promise<{ skills: SkillStore | undefined }> = stores(),
    ) => {
      const store = await held;
      let listing: unknown;
      const run = harness(
        (input) => {
          listing = input.skills;
          return agentThat([text("")])(input);
        },
        { stores: store, archives },
      );
      run.replies.start({ ...message, skills });
      await run.until();
      return { run, listing, store };
    };

    test("are put in the bot's /skills and listed for its agent, each fetched for this reply", async () => {
      const archives = new Map([
        [notes.digest, await archive("notes", notes.description)],
        [lint.digest, await archive("lint", lint.description)],
      ]);
      const { run, listing, store } = await answered([notes, lint], archives);

      expect(listing).toEqual([
        { name: "lint", description: "Built-in lint.", path: "/skills/lint/SKILL.md" },
        { name: "notes", description: "Personal notes.", path: "/skills/notes/SKILL.md" },
      ]);
      const dir = await store.skills!.dir("bot-1");
      expect(await readFile(join(dir, "notes", "SKILL.md"), "utf8")).toContain("Personal notes.");
      expect(
        run.calls.filter((call) => (call as { method: string }).method === "bot.skill"),
      ).toEqual([
        { method: "bot.skill", params: { replyId: "r1", digest: notes.digest } },
        { method: "bot.skill", params: { replyId: "r1", digest: lint.digest } },
      ]);
      expect(run.sent.at(-1)).toEqual({ type: "bot.end", replyId: "r1" });
    });

    test("a skill that cannot be had is left out and the reply goes on", async () => {
      const archives = new Map([[lint.digest, await archive("lint", lint.description)]]);
      const { run, listing } = await answered([notes, lint], archives);

      expect(listing).toEqual([
        { name: "lint", description: "Built-in lint.", path: "/skills/lint/SKILL.md" },
      ]);
      expect(run.sent.at(-1)).toEqual({ type: "bot.end", replyId: "r1" });
    });

    test("a reply with none empties the folder, and a runner with no store for them lists none", async () => {
      const held = stores();
      const archives = new Map([[notes.digest, await archive("notes", notes.description)]]);
      const first = await answered([notes], archives, held);
      const dir = await first.store.skills!.dir("bot-1");
      expect(await readdir(dir)).toEqual(["notes"]);

      const second = await answered(undefined, archives, held);
      expect(second.listing).toEqual([]);
      expect(await readdir(dir)).toEqual([]);

      const bare = await answered(
        [notes],
        archives,
        Promise.resolve({ skills: undefined as SkillStore | undefined }),
      );
      expect(bare.listing).toEqual([]);
      expect(bare.run.sent.at(-1)).toEqual({ type: "bot.end", replyId: "r1" });
    });
  });

  describe("files the person sent (decision 0080)", () => {
    const root = mkdtemp(join(tmpdir(), "aven-bot-files-"));
    afterAll(async () => rm(await root, { recursive: true, force: true }));
    const stores = async () => {
      const dir = await root;
      return {
        uploads: new UploadStore(join(dir, `uploads-${crypto.randomUUID()}`)),
        artifacts: new ArtifactStore(join(dir, `artifacts-${crypto.randomUUID()}`)),
      };
    };

    const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 7, 7]);
    const photo: RunAttachment = {
      name: "my cat.png",
      mediaType: "image/png",
      size: PNG.length,
      image: "0f0e0d0c-0b0a-4908-8706-050403020100.png",
      data: PNG.toBase64(),
    };
    const report: RunAttachment = {
      name: "report.pdf",
      mediaType: "application/pdf",
      size: 4,
      data: new TextEncoder().encode("%PDF").toBase64(),
    };

    const appended = (calls: unknown[]) =>
      calls
        .filter((call) => (call as { method: string }).method === "bot.memory")
        .map((call) => (call as { params: { op: string; messages?: unknown[] } }).params)
        .filter((params) => params.op === "append")
        .flatMap((params) => params.messages ?? []) as {
        role: string;
        content: { type: string; text?: string; mediaType?: string }[];
        metadata?: { prompt?: string; attachments?: unknown[] };
      }[];

    test("are copied to the bot's own /uploads, an image is kept to be shown, and the bot is told where they are and shown the image", async () => {
      const kept = await stores();
      const run = harness(agentThat([toolCall("send_message", { text: "nice cat" })], [text("")]), {
        stores: kept,
      });

      run.replies.start({ ...message, prompt: "what is this?", attachments: [photo, report] });
      await run.until();

      const dir = await kept.uploads.dir("bot-1");
      expect(new Uint8Array(await readFile(join(dir, "my_cat.png")))).toEqual(PNG);
      expect(await readFile(join(dir, "report.pdf"), "utf8")).toBe("%PDF");
      expect((await kept.artifacts.read("bot-1", photo.image!))?.mediaType).toBe("image/png");

      const [asked] = appended(run.calls);
      expect(asked?.role).toBe("user");
      const note = asked?.content.find((part) => part.text?.includes("/uploads/my_cat.png"));
      expect(note?.text).toContain("/uploads/report.pdf");
      expect(note?.text).toContain("shown to you below");
      expect(asked?.content.some((part) => part.type === "image")).toBe(true);
      expect(asked?.metadata).toEqual({
        prompt: "what is this?",
        attachments: [
          { name: "my cat.png", mediaType: "image/png", size: PNG.length, image: photo.image },
          { name: "report.pdf", mediaType: "application/pdf", size: 4 },
        ],
      });
      expect(run.sent.at(-1)).toEqual({ type: "bot.end", replyId: "r1" });
    });

    test("a message of only files is a message, with an empty text", async () => {
      const kept = await stores();
      const run = harness(agentThat([toolCall("send_message", { text: "got it" })], [text("")]), {
        stores: kept,
      });
      run.replies.start({ ...message, prompt: "", attachments: [report] });
      await run.until();
      const [asked] = appended(run.calls);
      expect(asked?.metadata?.prompt).toBe("");
      expect(run.sent.at(-1)).toEqual({ type: "bot.end", replyId: "r1" });
    });

    test("a runner that cannot keep files fails the reply, and says so", async () => {
      const run = harness(agentThat([toolCall("send_message", { text: "never" })], [text("")]));
      run.replies.start({ ...message, attachments: [report] });
      await run.until();
      expect(run.sent).toEqual([
        { type: "bot.end", replyId: "r1", error: "This runner cannot take attached files" },
      ]);
    });

    test("a message with no files is asked as plain text, as it was", async () => {
      const run = harness(agentThat([toolCall("send_message", { text: "hi" })], [text("")]));
      run.replies.start(message);
      await run.until();
      const [asked] = appended(run.calls);
      expect(asked?.metadata).toBeUndefined();
    });
  });

  test("the bot's messages go back in order, each after its typing pause, then the reply ends", async () => {
    const run = harness(
      agentThat(
        [
          toolCall("send_message", { text: "hey!" }),
          toolCall("send_message", { text: "how are you?" }),
        ],
        [text("")],
      ),
    );

    run.replies.start(message);
    await run.until();

    expect(run.sent).toEqual([
      { type: "bot.say", replyId: "r1", text: "hey!" },
      { type: "bot.say", replyId: "r1", text: "how are you?" },
      { type: "bot.end", replyId: "r1" },
    ]);
    expect(run.pauses).toHaveLength(2);
    expect(run.finished).toEqual(["bot-1"]);
  });

  describe("an answer in plain text (decision 0125)", () => {
    test("is sent back to the bot once, to be sent as a message, when a person was answered", async () => {
      const run = harness(
        agentThat(
          [text("Done, the thread finished.")],
          [toolCall("send_message", { text: "Done, the thread finished." })],
          [text("")],
        ),
      );

      run.replies.start(message);
      await run.until();

      expect(run.sent).toEqual([
        { type: "bot.say", replyId: "r1", text: "Done, the thread finished." },
        { type: "bot.end", replyId: "r1" },
      ]);
    });

    test("is not asked for again, and ends the reply, when the bot still does not send", async () => {
      const run = harness(agentThat([text("one")], [text("two")]));

      run.replies.start(message);
      await run.until();

      expect(run.sent).toEqual([{ type: "bot.end", replyId: "r1" }]);
    });

    test("is left alone for a note, which has no one to answer, and for another bot", async () => {
      for (const prompt of ["[note] A schedule is due", "[from scout] hi"]) {
        const run = harness(agentThat([text("nothing to say")]));
        run.replies.start({ ...message, prompt });
        await run.until();
        expect(run.sent).toEqual([{ type: "bot.end", replyId: "r1" }]);
      }
    });

    test("is not asked for when the bot asked the person a question", async () => {
      const run = harness(
        ({ send, askQuestion, memory }) =>
          new Agent({
            id: "bot",
            model: scriptedModel([
              [
                toolCall("ask_question", {
                  questions: [
                    { id: "q", text: "Which one?", options: [{ label: "A" }, { label: "B" }] },
                  ],
                }),
              ],
              [text("")],
            ]),
            instructions: "x",
            memory,
            tools: [createSendMessageTool(send), createAskQuestionTool(askQuestion!)],
          }),
      );

      run.replies.start(message);
      await run.until();

      expect(run.sent).toEqual([{ type: "bot.end", replyId: "r1" }]);
    });
  });

  test("messages sent in one turn are typed one at a time, never together", async () => {
    let typing = 0;
    let most = 0;
    const sent: RuntimeToControlPlane[] = [];
    const replies = new BotReplies({
      sandbox: sandboxWith(),
      createAgent: agentThat(
        [
          toolCall("send_message", { text: "one" }),
          toolCall("send_message", { text: "two" }),
          toolCall("send_message", { text: "three" }),
        ],
        [text("")],
      ),
      send: (frame) => (sent.push(frame), true),
      call: async (_method, params) => memoryAnswer(params),
      boxes: new Map(),
      starting: async () => undefined,
      finished: () => undefined,
      pause: async () => {
        typing += 1;
        most = Math.max(most, typing);
        await Bun.sleep(2);
        typing -= 1;
      },
    });

    replies.start(message);
    for (let i = 0; i < 100 && !sent.some((frame) => frame.type === "bot.end"); i++) {
      await Bun.sleep(10);
    }

    expect(most).toBe(1);
    expect(sent.filter((frame) => frame.type === "bot.say")).toHaveLength(3);
  });

  describe("a computer on another machine (decision 0222)", () => {
    const skill = { name: "notes", description: "Personal notes.", digest: "1".repeat(64) };

    test("tools and skills run there, and this runner's computer is left alone", async () => {
      const there: { id: string; repo: unknown }[] = [];
      const installed: unknown[] = [];
      const machines: ThreadWorkspaces = {
        ...sandboxWith(there),
        skills: {
          async install(_id, skills) {
            installed.push(skills);
            return skills.map((each) => ({
              name: each.name,
              description: each.description,
              path: `/skills/${each.name}/SKILL.md`,
            }));
          },
        },
      };
      let computer: readonly { name: string }[] = [];
      const run = harness(
        (input) => {
          computer = input.computer;
          return agentThat(
            [toolCall("exec_command", { command: "pwd" })],
            [toolCall("send_message", { text: "ran" })],
            [text("")],
          )(input);
        },
        { machines },
      );

      run.replies.start({ ...message, machine: "rt-bot", skills: [skill] });
      await run.until();

      expect(there).toEqual([{ id: "bot-1", repo: undefined }]);
      expect(run.acquired).toEqual([]);
      expect(computer.map((each) => each.name)).toEqual(["exec_command"]);
      expect(installed).toEqual([[skill]]);
      expect(run.sent.at(-1)).toEqual({ type: "bot.end", replyId: "r1" });
    });

    test("a reply with no machine keeps this runner's computer, even when another can be reached", async () => {
      const there: { id: string; repo: unknown }[] = [];
      const run = harness(agentThat([text("")]), { machines: sandboxWith(there) });

      run.replies.start(message);
      await run.until();

      expect(run.acquired).toEqual([{ id: "bot-1", repo: undefined }]);
      expect(there).toEqual([]);
    });

    test("a reply that names a machine this runner cannot reach fails, and says so", async () => {
      const run = harness(agentThat([text("")]));
      run.replies.start({ ...message, machine: "rt-bot" });
      await run.until();
      expect(run.sent).toEqual([
        { type: "bot.end", replyId: "r1", error: "This runner cannot reach another computer" },
      ]);
    });

    test("an MCP server on a private address is refused, since the agent runs elsewhere", async () => {
      const run = harness(agentThat([text("")]), { machines: sandboxWith() });
      run.replies.start({
        ...message,
        machine: "rt-bot",
        mcp: [
          {
            id: "m1",
            name: "Notes",
            url: "http://127.0.0.1:9/mcp",
            headers: {},
            allowLocal: true,
          },
        ],
      });
      await run.until();

      const reported = run.calls.find(
        (call) =>
          (call as { method: string; params: { op?: string } }).method === "bot.mcp" &&
          (call as { params: { op?: string } }).params.op === "report",
      ) as { params: { results: { error?: string }[] } } | undefined;
      expect(reported?.params.results[0]?.error).toContain("MCP URL blocked");
      expect(run.sent.at(-1)).toEqual({ type: "bot.end", replyId: "r1" });
    });
  });

  test("the bot works on its own computer: no repository, and no show_image, which has nowhere to go", async () => {
    let computer: readonly AnyTool[] = [];
    const run = harness((input) => {
      computer = input.computer;
      return agentThat([text("")])(input);
    });

    run.replies.start(message);
    await run.until();

    expect(run.acquired).toEqual([{ id: "bot-1", repo: undefined }]);
    expect(computer.map((each) => each.name)).toEqual(["exec_command"]);
    expect(run.boxes.has("bot-1")).toBe(true);
  });

  test("the main bot makes a bot by asking the control plane, for its own reply", async () => {
    const run = harness(
      agentThat(
        [toolCall("create_bot", { name: "Scout", instruction: "You research." })],
        [toolCall("send_message", { text: "Scout is ready" })],
        [text("")],
      ),
    );

    run.replies.start({ ...message, bot: { ...message.bot, canCreateBots: true } });
    await run.until();

    expect(run.calls).toContainEqual({
      method: "bot.create",
      params: { replyId: "r1", name: "Scout", instruction: "You research." },
    });
    expect(run.sent).toEqual([
      { type: "bot.say", replyId: "r1", text: "Scout is ready" },
      { type: "bot.end", replyId: "r1" },
    ]);
  });

  test("a bot writes to another by asking the control plane, for its own reply, and what it writes to the person is typed", async () => {
    const run = harness(
      agentThat(
        [
          toolCall("send_message", { to: "scout", text: "do A" }),
          toolCall("send_message", { text: "I asked Scout" }),
        ],
        [text("")],
      ),
    );

    run.replies.start({
      ...message,
      bot: { ...message.bot, peers: [{ handle: "scout", name: "Scout", description: "" }] },
    });
    await run.until();

    expect(run.calls).toContainEqual({
      method: "bot.send",
      params: { replyId: "r1", to: "scout", text: "do A" },
    });
    expect(run.sent).toEqual([
      { type: "bot.say", replyId: "r1", text: "I asked Scout" },
      { type: "bot.end", replyId: "r1" },
    ]);
    expect(run.pauses).toHaveLength(1);
  });

  test("a refusal of the control plane to carry a message to a bot reaches the bot as the tool's error", async () => {
    const run = harness(
      ({ send, memory }) => ({
        generate: async () => {
          await memory.store.load({ scope: { sessionId: "bot-1" } });
          const refused = await send({ to: "ghost", text: "hi" }, {}).catch(
            (error: Error) => error.message,
          );
          await send({ to: "user", text: refused }, {});
          return { type: "response" } as never;
        },
      }),
      { failSend: true },
    );

    run.replies.start(message);
    await run.until();

    expect(run.sent).toContainEqual({
      type: "bot.say",
      replyId: "r1",
      text: 'No bot with the handle "ghost"',
    });
  });

  test("a bot the main bot makes is on the list of bots it may write to, from then on in the reply", async () => {
    let peers: readonly unknown[] = [];
    const run = harness((input) => {
      peers = input.peers;
      return agentThat(
        [
          toolCall("create_bot", {
            name: "Scout",
            instruction: "You research.",
            description: "Looks.",
          }),
        ],
        [text("")],
      )(input);
    });

    run.replies.start({ ...message, bot: { ...message.bot, canCreateBots: true } });
    await run.until();

    expect(peers).toEqual([{ handle: "scout", name: "Scout", description: "Looks." }]);
  });

  test("a bot asks the person through the control plane, unless a note woke it, when nobody is there", async () => {
    const asked: unknown[] = [];
    const run = harness((input) => {
      asked.push(input.askQuestion);
      return agentThat([text("")])(input);
    });
    run.replies.start(message);
    await run.until();
    expect(typeof asked[0]).toBe("function");

    const noted = harness((input) => {
      asked.push(input.askQuestion);
      return agentThat([text("")])(input);
    });
    noted.replies.start({ ...message, prompt: "[note] Say hello." });
    await noted.until();
    expect(asked[1]).toBeUndefined();
  });

  test("a bot's schedules are asked of the control plane, for its own reply, and its timezone is the person's", async () => {
    let timezone: string | undefined;
    const view = { id: "s1", bot: "pip", name: "News", cron: "0 7 * * *" };
    const run = harness((input) => {
      timezone = input.bot.timezone;
      return {
        generate: async () => {
          await input.schedules.list();
          await input.schedules.create({ name: "News", cron: "0 7 * * *", prompt: "Read it." });
          await input.schedules.update("s1", { enabled: false });
          await input.schedules.remove("s1");
          return { type: "response" } as never;
        },
      };
    });

    run.replies.start({ ...message, prompt: "[note] go" });
    await run.until();

    expect(timezone).toBe("Asia/Jakarta");
    expect(
      run.calls.filter((call) => (call as { method: string }).method === "bot.schedule"),
    ).toEqual([
      { method: "bot.schedule", params: { replyId: "r1", op: "list" } },
      {
        method: "bot.schedule",
        params: {
          replyId: "r1",
          op: "create",
          name: "News",
          cron: "0 7 * * *",
          prompt: "Read it.",
        },
      },
      { method: "bot.schedule", params: { replyId: "r1", op: "update", id: "s1", enabled: false } },
      { method: "bot.schedule", params: { replyId: "r1", op: "delete", id: "s1" } },
    ]);
    expect(view.id).toBe("s1");
  });

  test("a bot's goal is asked of the control plane, for its own reply", async () => {
    const run = harness((input) => ({
      generate: async () => {
        await input.goals.get();
        await input.goals.start({ objective: "Port it", checks: ["bun test"], maxRounds: 5 });
        await input.goals.update("blocked", "no key");
        await input.goals.update("pause");
        return { type: "response" } as never;
      },
    }));

    run.replies.start({ ...message, prompt: "[note] go" });
    await run.until();

    expect(run.calls.filter((call) => (call as { method: string }).method === "bot.goal")).toEqual([
      { method: "bot.goal", params: { replyId: "r1", op: "get" } },
      {
        method: "bot.goal",
        params: {
          replyId: "r1",
          op: "start",
          objective: "Port it",
          checks: ["bun test"],
          maxRounds: 5,
        },
      },
      {
        method: "bot.goal",
        params: { replyId: "r1", op: "update", action: "blocked", reason: "no key" },
      },
      {
        method: "bot.goal",
        params: { replyId: "r1", op: "update", action: "pause", reason: undefined },
      },
    ]);
  });

  test("a goal's checks run on the bot's computer in order, and what did not pass is told with its output", async () => {
    const ran: string[] = [];
    let failed: string[] = [];
    const run = harness(
      (input) => ({
        generate: async () => {
          failed = await input.goals.check!(["build", "test", "lint"]);
          return { type: "response" } as never;
        },
      }),
      {
        exec: (command) => {
          ran.push(command);
          if (command === "test")
            return { status: "exited", exitCode: 1, stdout: "", stderr: "2 failed" };
          if (command === "lint") return { status: "timed_out", stdout: "", stderr: "" };
          return { status: "exited", exitCode: 0, stdout: "fine", stderr: "" };
        },
      },
    );

    run.replies.start({ ...message, prompt: "[note] go" });
    await run.until();

    expect(ran).toEqual(["build", "test", "lint"]);
    expect(failed).toHaveLength(2);
    expect(failed[0]).toBe("$ test\n(exited 1)\n2 failed");
    expect(failed[1]).toStartWith("$ lint\n(timed out)");
    expect(failed[1]).toContain("timed out");
  });

  test("a cancelled reply stops running a goal's checks", async () => {
    const ran: string[] = [];
    const controller = new AbortController();
    let outcome: unknown;
    const run = harness(
      (input) => ({
        generate: async () => {
          outcome = await input.goals.check!(["build", "test"], controller.signal).catch(
            (error: unknown) => error,
          );
          return { type: "response" } as never;
        },
      }),
      {
        exec: (command) => {
          ran.push(command);
          controller.abort(new Error("cancelled"));
          return { status: "exited", exitCode: 0, stdout: "", stderr: "" };
        },
      },
    );

    run.replies.start(message);
    await run.until();

    expect(ran).toEqual(["build"]);
    expect(outcome).toBeInstanceOf(Error);
  });

  test("any bot changes itself by asking the control plane, for its own reply", async () => {
    const run = harness(
      agentThat(
        [toolCall("update_self", { description: "Now for research." })],
        [toolCall("send_message", { text: "Done" })],
        [text("")],
      ),
    );

    run.replies.start(message);
    await run.until();

    expect(run.calls).toContainEqual({
      method: "bot.update",
      params: { replyId: "r1", description: "Now for research." },
    });
    expect(run.sent).toEqual([
      { type: "bot.say", replyId: "r1", text: "Done" },
      { type: "bot.end", replyId: "r1" },
    ]);
  });

  test("a reply with memory has the bot's notes, worked through bot.notes (decision 0102)", async () => {
    const memory = { folders: [{ scope: "bot" as const, notes: [] }], writable: true };
    let given: Parameters<CreateBotReplyAgent>[0]["notes"];
    const run = harness((input) => {
      given = input.notes;
      return agentThat([text("")])(input);
    });

    run.replies.start({ ...message, memory });
    await run.until();
    expect(given?.memory).toEqual(memory);
    await given!.host({ command: "view", path: "/memories/bot" });
    expect(run.calls).toContainEqual({
      method: "bot.notes",
      params: { replyId: "r1", command: { command: "view", path: "/memories/bot" } },
    });

    let none: unknown = "unset";
    const plain = harness((input) => {
      none = input.notes;
      return agentThat([text("")])(input);
    });
    plain.replies.start(message);
    await plain.until();
    expect(none).toBeUndefined();
  });

  test("the agent is told the bot's description as it is now", async () => {
    let described: string | undefined;
    const run = harness((input) => {
      described = input.bot.description;
      return agentThat([text("")])(input);
    });

    run.replies.start(message);
    await run.until();

    expect(described).toBe("A pal.");
  });

  describe("the agent the runner builds", () => {
    const build = (
      canCreateBots: boolean,
      asking = false,
      skills: readonly SkillListing[] = [],
      computer: readonly AnyTool[] = [],
      mcp?: { tools: readonly AnyTool[]; note: McpNote },
    ) =>
      defaultCreateBotAgent("http://control-plane")({
        bot: {
          ...message.bot,
          canCreateBots,
          handle: canCreateBots ? "main" : "pip",
          peers: [{ handle: "scout", name: "Scout", description: "Looks things up." }],
        },
        model: { provider: "openai", gatewayPath: "/g", gatewayToken: "t" },
        send: async () => "Sent",
        goals: {
          get: async () => null,
          start: async () => {
            throw new Error("not started");
          },
          update: async () => null,
        },
        schedules: {
          list: async () => [],
          create: async () => {
            throw new Error("not made");
          },
          update: async () => {
            throw new Error("not changed");
          },
          remove: async () => undefined,
        },
        peers: [{ handle: "scout", name: "Scout", description: "Looks things up." }],
        memory: {
          store: {
            load: async () => [],
            append: async () => undefined,
            clear: async () => undefined,
          },
          savePolicy: "turn",
        },
        computer,
        askQuestion: asking ? async () => ({}) : undefined,
        updateSelf: async () => ({ name: "Pip", description: "" }),
        skills,
        mcp,
        mcpServers: {
          list: async () => [],
          add: async () => {
            throw new Error("not added");
          },
          update: async () => {
            throw new Error("not changed");
          },
          remove: async () => undefined,
        },
        providers: {
          list: async () => [],
          add: async () => {
            throw new Error("not added");
          },
          update: async () => {
            throw new Error("not changed");
          },
          remove: async () => undefined,
          models: async () => [],
          askKey: asking ? async () => ({ providerId: "p", name: "P" }) : undefined,
        },
        threads: {
          projects: async () => [],
          list: async () => [],
          get: async () => {
            throw new Error("not found");
          },
          start: async () => {
            throw new Error("not started");
          },
          continue: async () => {
            throw new Error("not continued");
          },
          archive: async () => {
            throw new Error("not archived");
          },
          stop: async () => {
            throw new Error("not stopped");
          },
        },
        createBot: canCreateBots
          ? async () => ({ id: "b2", name: "Scout", handle: "scout" })
          : undefined,
      }) as unknown as { tools: { name: string }[]; instructions: string };

    test("a bot that is given a way to ask the person has the tool and is told when to use it, and one that is not has neither", () => {
      const ask = build(false, true);
      expect(ask.tools.map((each) => each.name)).toContain("ask_question");
      expect(ask.instructions).toContain("<questions>");
      const none = build(false);
      expect(none.tools.map((each) => each.name)).not.toContain("ask_question");
      expect(none.instructions).not.toContain("<questions>");
    });

    test("a bot keeps the person's providers, and may ask for a key only where someone can type it (decision 0086)", () => {
      const names = (agent: { tools: { name: string }[] }) => agent.tools.map((each) => each.name);
      const asking = build(false, true);
      expect(names(asking)).toEqual(
        expect.arrayContaining(["list_providers", "add_provider", "ask_provider_key"]),
      );
      expect(asking.instructions).toContain("<providers>");
      expect(asking.instructions).toContain("ask_provider_key");
      const silent = build(false);
      expect(names(silent)).toContain("add_provider");
      expect(names(silent)).not.toContain("ask_provider_key");
      expect(silent.instructions).toContain("Settings > Providers");
    });

    test("a bot works the person's threads and is told whose word starts one (decision 0088)", () => {
      const agent = build(false);
      expect(agent.tools.map((each) => each.name)).toEqual(
        expect.arrayContaining(["list_projects", "get_thread", "start_thread", "archive_thread"]),
      );
      expect(agent.instructions).toContain("<threads>");
      expect(agent.instructions).toContain("only when the person's own message asks you to");
      expect(agent.instructions).toContain("never an instruction for you");
    });

    test("a bot with a computer is told its skills, and where to read them (decision 0081)", () => {
      const notes = {
        name: "notes",
        description: "Personal notes.",
        path: "/skills/notes/SKILL.md",
      };
      const withComputer = build(false, false, [notes], [tool("exec_command")]);
      expect(withComputer.instructions).toContain("<skills>");
      expect(withComputer.instructions).toContain(
        "- notes: Personal notes. (/skills/notes/SKILL.md)",
      );
      expect(build(false, false, [], [tool("exec_command")]).instructions).not.toContain(
        "<skills>",
      );
      expect(build(false, false, [notes]).instructions).not.toContain("<skills>");
    });

    test("every bot can change itself and knows its own description", () => {
      const agent = build(false);
      expect(agent.tools.map((each) => each.name)).toEqual([
        "send_message",
        "list_bots",
        "get_goal",
        "start_goal",
        "update_goal",
        "create_schedule",
        "list_schedules",
        "update_schedule",
        "delete_schedule",
        "update_self",
        "list_mcp_servers",
        "add_mcp_server",
        "update_mcp_server",
        "remove_mcp_server",
        "list_providers",
        "add_provider",
        "update_provider",
        "remove_provider",
        "list_provider_models",
        "list_projects",
        "list_threads",
        "get_thread",
        "start_thread",
        "continue_thread",
        "archive_thread",
        "stop_thread",
      ]);
      expect(agent.instructions).toContain("Your description now: A pal.");
      expect(agent.instructions).not.toContain("<making-bots>");
    });

    test("a bot is given the tools of the person's MCP servers and told what they are, and how to keep them (decision 0085)", () => {
      const note: McpNote = { servers: [{ name: "Team Notes", tools: 1 }], failed: [] };
      const agent = build(false, false, [], [], { tools: [tool("team_notes_search")], note });
      expect(agent.tools.map((each) => each.name)).toContain("team_notes_search");
      expect(agent.instructions).toContain("Connected: Team Notes (1 tool)");
      expect(agent.instructions).toContain("<mcp-servers>");
      expect(agent.instructions).toContain("Change them only when the person's own message");

      const none = build(false);
      expect(none.tools.map((each) => each.name)).not.toContain("team_notes_search");
      expect(none.instructions).not.toContain("<mcp_servers>");
    });

    test("the main bot can make bots too", () => {
      const agent = build(true);
      expect(agent.tools.map((each) => each.name)).toEqual([
        "send_message",
        "list_bots",
        "get_goal",
        "start_goal",
        "update_goal",
        "create_schedule",
        "list_schedules",
        "update_schedule",
        "delete_schedule",
        "create_bot",
        "update_self",
        "list_mcp_servers",
        "add_mcp_server",
        "update_mcp_server",
        "remove_mcp_server",
        "list_providers",
        "add_provider",
        "update_provider",
        "remove_provider",
        "list_provider_models",
        "list_projects",
        "list_threads",
        "get_thread",
        "start_thread",
        "continue_thread",
        "archive_thread",
        "stop_thread",
      ]);
      expect(agent.instructions).toContain("<making-bots>");
      expect(agent.instructions).toContain("- Scout (handle: scout): Looks things up.");
    });
  });

  test("a bot that may not make bots is not given the tool", async () => {
    let offered: unknown = "unset";
    const run = harness((input) => {
      offered = input.createBot;
      return agentThat([text("")])(input);
    });

    run.replies.start(message);
    await run.until();

    expect(offered).toBeUndefined();
  });

  test("its conversation is asked of the control plane, not kept here", async () => {
    const run = harness(({ memory, send }) => ({
      generate: async () => {
        await memory.store.load({ scope: { sessionId: "bot-1" } });
        await memory.store.append({
          scope: { sessionId: "bot-1" },
          runId: "x",
          turn: 1,
          messages: [],
        });
        await send({ to: "user", text: "hi" }, {});
        return { type: "response" } as never;
      },
    }));

    run.replies.start(message);
    await run.until();

    expect(run.calls).toEqual([
      { method: "bot.memory", params: { replyId: "r1", op: "load" } },
      {
        method: "bot.memory",
        params: { replyId: "r1", op: "append", runId: "x", turn: 1, messages: [] },
      },
    ]);
  });

  test("a failed reply says why", async () => {
    const run = harness(() => ({
      generate: async () => {
        throw new Error("the model is down");
      },
    }));

    run.replies.start(message);
    await run.until();

    expect(run.sent).toEqual([{ type: "bot.end", replyId: "r1", error: "the model is down" }]);
    expect(run.finished).toEqual(["bot-1"]);
  });

  test("a cancel stops the reply, in the middle of a typing pause", async () => {
    const typing = Promise.withResolvers<void>();
    const sent: RuntimeToControlPlane[] = [];
    const replies = new BotReplies({
      sandbox: sandboxWith(),
      createAgent: agentThat([toolCall("send_message", { text: "never" })], [text("")]),
      send: (frame) => (sent.push(frame), true),
      call: async (_method, params) => memoryAnswer(params),
      boxes: new Map(),
      starting: async () => undefined,
      finished: () => undefined,
      pause: (_ms, signal) =>
        new Promise<void>((_resolve, reject) => {
          typing.resolve();
          signal?.addEventListener("abort", () => reject(signal.reason));
        }),
    });

    replies.start(message);
    await typing.promise;
    replies.cancel("r1", "Shutting down");
    for (let i = 0; i < 100 && sent.length === 0; i++) await Bun.sleep(10);

    expect(sent).toEqual([{ type: "bot.end", replyId: "r1", error: "Shutting down" }]);
    expect(replies.has("bot-1")).toBe(false);
  });

  test("it knows which bots are answering, so their computers are not released from under them", async () => {
    const gate = Promise.withResolvers<void>();
    const run = harness(() => ({
      generate: async () => {
        await gate.promise;
        return { type: "response" } as never;
      },
    }));

    run.replies.start(message);
    await Bun.sleep(20);
    expect(run.replies.has("bot-1")).toBe(true);
    expect(run.replies.has("bot-2")).toBe(false);

    gate.resolve();
    await run.until();
    expect(run.replies.has("bot-1")).toBe(false);
  });

  test("a message that cannot be sent because the link is down ends the reply: the bot is not left to try again", async () => {
    const run = harness(
      agentThat(
        [toolCall("send_message", { text: "one" })],
        [toolCall("send_message", { text: "two" })],
        [text("")],
      ),
      { linkUp: () => false },
    );

    run.replies.start(message);
    for (let i = 0; i < 100 && run.replies.has("bot-1"); i++) await Bun.sleep(10);

    expect(run.sent).toEqual([]);
    expect(run.pauses).toHaveLength(1);
    expect(run.finished).toEqual(["bot-1"]);
  });

  test("when the connection drops every reply is aborted", async () => {
    const started = Promise.withResolvers<void>();
    const run = harness(() => ({
      generate: async ({ abortSignal }) => {
        started.resolve();
        await new Promise((_resolve, reject) =>
          abortSignal?.addEventListener("abort", () => reject(abortSignal.reason)),
        );
        return { type: "response" } as never;
      },
    }));

    run.replies.start(message);
    await started.promise;
    run.replies.abortAll("The connection to the control plane dropped");
    await run.until();

    expect(run.sent).toEqual([
      { type: "bot.end", replyId: "r1", error: "The connection to the control plane dropped" },
    ]);
  });
});
