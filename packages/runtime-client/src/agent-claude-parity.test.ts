import { createTool } from "@anvia/core";
import { parseAgentContinuation } from "@anvia/core/agent/interactions";
import { NOTHING_TO_COMPACT } from "@aven/agents/compaction-agent";
import { describe, expect, test } from "bun:test";
import { z } from "zod";

import { backendFor } from "./agent-backends";
import { callAvenTool } from "@aven/claude/claude-mcp";
import { ClaudeRuns } from "@aven/claude/claude-backend";
import { createRunDriver } from "./run-driver";
import { RunOutbox, openRunDatabase } from "./run-outbox";
import { RunRecords } from "./run-records";
import { journalPath } from "@aven/agent-backend/testing/journal-path";
import { noProcesses } from "./thread-processes";
import type { RuntimeToControlPlane } from "@aven/protocol/types";
import type { ClaudeQuery, ClaudeQueryInput, ClaudeRunContext } from "@aven/agent-backend/types";
import type { RunMessage, ThreadWorkspaces } from "./types";

const TOKEN = "setup-token-parity-thread-0001";

const context = (extra: Partial<ClaudeRunContext> = {}): ClaudeRunContext => ({
  token: TOKEN,
  workspace: async () => "/work",
  redact: (text) => text,
  env: [],
  tools: {},
  ...extra,
});

function scripted(text = "done"): { query: ClaudeQuery; inputs: ClaudeQueryInput[] } {
  const inputs: ClaudeQueryInput[] = [];
  const query: ClaudeQuery = async function* (input) {
    inputs.push(input);
    const iterator = input.prompt[Symbol.asyncIterator]();
    const first = await iterator.next();
    yield {
      type: "assistant",
      session_id: "sess-parity",
      message: { content: [{ type: "text", text: first.done ? text : `${text} ${first.value}` }] },
    };
    yield {
      type: "result",
      subtype: "success",
      session_id: "sess-parity",
      usage: { input_tokens: 2, output_tokens: 1 },
    };
  };
  return { query, inputs };
}

describe("Claude parity with the native agent", () => {
  test("asks, parks the run, and resumes with the answer", async () => {
    const questions = {
      questions: [
        {
          id: "color",
          text: "Which color?",
          choices: [
            { label: "Red", value: "red" },
            { label: "Blue", value: "blue" },
          ],
        },
      ],
    };
    const inputs: ClaudeQueryInput[] = [];
    const query: ClaudeQuery = async function* (input) {
      inputs.push(input);
      yield {
        type: "assistant",
        session_id: "sess-ask",
        message: {
          content: [{ type: "tool_use", id: "q1", name: "mcp__aven__ask_user", input: questions }],
        },
      };
      const answer = await callAvenTool("ask_user", questions, input.tools);
      yield {
        type: "user",
        message: { content: [{ type: "tool_result", tool_use_id: "q1", content: answer }] },
      };
      yield {
        type: "assistant",
        session_id: "sess-ask",
        message: { content: [{ type: "text", text: "Going with the answer" }] },
      };
      yield { type: "result", subtype: "success", session_id: "sess-ask" };
    };
    const { driver, reported, backend } = driverFor(query);
    await driver.start(start("run-1", "thread-a"));
    const parked = reported.find(
      (message) => message.type === "run.end" && message.outcome === "interaction",
    );
    expect(parked && parked.type === "run.end" && parked.continuation).toBeTruthy();
    const continuation = parked && parked.type === "run.end" ? parked.continuation : undefined;
    expect(parseAgentContinuation(continuation).interaction.toolName).toBe("ask_user");
    const events = reported.filter((message) => message.type === "run.event");
    expect(JSON.stringify(events)).toContain("Which color?");

    await driver.start({
      type: "run.resume",
      runId: "run-2",
      thread: { id: "thread-a", organizationId: "org-1" },
      continuation,
      response: { type: "tool-question", answers: [{ questionId: "color", value: "red" }] },
      backend: "claude",
      claudeToken: TOKEN,
    });
    await backend.close();
    const ends = reported.filter((message) => message.type === "run.end");
    expect(ends.at(-1)).toMatchObject({ outcome: "response" });
    expect(JSON.stringify(reported)).toContain("color: red");
    expect(inputs).toHaveLength(1);
  });

  test("runs a goal session and completes when the checks pass", async () => {
    const { query, inputs } = scripted("shipped");
    const runs = ClaudeRuns.open(journalPath(), query);
    const goal = await runs.startGoal({
      runId: "goal-1",
      request: {
        objective: "Ship it",
        acceptanceCriteria: ["tests pass"],
        verifyCommands: ["bun test"],
      },
      input: { claude: context({ questions: false }) },
      verify: async () => [{ command: "bun test", exitCode: 0, output: "" }],
      onEvent: () => undefined,
      onSession: async () => undefined,
    });
    const end = await goal.done;
    await runs.close();
    expect(end.type).toBe("complete");

    if (end.type === "complete") expect(end.evidence).toEqual(["`bun test` passed"]);

    expect(inputs).toHaveLength(1);
  });

  test("pauses a goal that makes no progress", async () => {
    const { query } = scripted("still failing");
    const runs = ClaudeRuns.open(journalPath(), query);
    const goal = await runs.startGoal({
      runId: "goal-2",
      request: {
        objective: "Make the tests pass",
        acceptanceCriteria: ["tests pass"],
        verifyCommands: ["bun test"],
        maxSessions: 3,
      },
      input: { claude: context({ questions: false }) },
      verify: async () => [{ command: "bun test", exitCode: 1, output: "fail" }],
      onEvent: () => undefined,
      onSession: async () => undefined,
    });
    const end = await goal.done;
    await runs.close();
    expect(end).toMatchObject({ type: "paused", reason: "no_progress" });
  });

  test("a message sent to a goal is reported as applied once the goal takes it", async () => {
    const { query } = scripted("still failing");
    const runs = ClaudeRuns.open(journalPath(), query);
    const events: { type: string; id?: string }[] = [];
    const goal = await runs.startGoal({
      runId: "goal-3",
      request: {
        objective: "Make the tests pass",
        acceptanceCriteria: ["tests pass"],
        verifyCommands: ["bun test"],
        maxSessions: 2,
      },
      input: { claude: context({ questions: false }) },
      verify: async () => [{ command: "bun test", exitCode: 1, output: "fail" }],
      onEvent: (event) => void events.push(event),
      onSession: async () => undefined,
    });
    await goal.steer("also keep commits atomic", "steer-1");
    await goal.done;
    await runs.close();
    expect(events.filter((event) => event.type === "steer_applied")).toEqual([
      { type: "steer_applied", id: "steer-1" },
    ]);
  });

  test("continues an interrupted run on the same Claude session", async () => {
    const { query, inputs } = scripted("hello");
    const runs = ClaudeRuns.open(journalPath(), query);
    const started = await runs.start(
      "run-1",
      "thread-a",
      "look",
      { claude: context() },
      () => undefined,
    );
    await started.done;
    const again = await runs.rejoin(started.durableId, { claude: context() }, 0, () => undefined);
    await again.done;
    await runs.close();
    expect(inputs[1]?.sessionId).toBe("sess-parity");
    expect(inputs[1]?.resumeInterrupted).toBe(true);
  });

  test("compacts a session and says when there is nothing to compact", async () => {
    const { query, inputs } = scripted("hello");
    const runs = ClaudeRuns.open(journalPath(), query);
    const events: string[] = [];
    const empty = await runs.start(
      "run-1",
      "thread-a",
      "/compact",
      { claude: context({ compact: true }) },
      (event) => {
        if (event.type === "text") events.push(event.delta);
      },
    );
    await empty.done;
    expect(events).toEqual([NOTHING_TO_COMPACT]);
    expect(inputs).toHaveLength(0);

    const first = await runs.start(
      "run-2",
      "thread-a",
      "look",
      { claude: context() },
      () => undefined,
    );
    await first.done;
    const compacted: string[] = [];
    const compact = await runs.start(
      "run-3",
      "thread-a",
      "ignored",
      { claude: context({ compact: true }) },
      (event) => {
        if (event.type === "text") compacted.push(event.delta);
      },
    );
    await compact.done;
    await runs.close();
    expect(inputs.at(-1)?.sessionId).toBe("sess-parity");
    expect(compacted.join("")).toBe("hello /compact");
  });

  test("reports a typed stop and the model's usage", async () => {
    const query: ClaudeQuery = async function* (input) {
      const iterator = input.prompt[Symbol.asyncIterator]();
      await iterator.next();
      yield {
        type: "result",
        subtype: "error_max_turns",
        usage: { input_tokens: 9, output_tokens: 4 },
      };
    };
    const runs = ClaudeRuns.open(journalPath(), query);
    const events: RuntimeToControlPlane[] = [];
    const followed = await runs.start("run-1", "thread-a", "go", { claude: context() }, (event) => {
      events.push({ type: "run.event", runId: "run-1", seq: events.length, event });
    });
    const end = await followed.done;
    await runs.close();
    expect(end).toMatchObject({ type: "error", error: "The run used all of its turns" });
    expect(
      events.some((message) => message.type === "run.event" && message.event.type === "usage"),
    ).toBe(true);
  });

  test("uses the model the person chose", async () => {
    const { query, inputs } = scripted();
    const runs = ClaudeRuns.open(journalPath(), query);
    const followed = await runs.start(
      "run-1",
      "thread-a",
      "go",
      { claude: context({ model: "claude-opus-4-8" }) },
      () => undefined,
    );
    await followed.done;
    await runs.close();
    expect(inputs[0]?.model).toBe("claude-opus-4-8");
  });

  test("a subagent works on its own and reports back", async () => {
    let nested = false;
    const query: ClaudeQuery = async function* (input) {
      const iterator = input.prompt[Symbol.asyncIterator]();
      await iterator.next();

      if (!nested && input.tools.runSubagent) {
        nested = true;
        const output = await input.tools.runSubagent(
          { description: "Find auth", prompt: "Where is login?", type: "explore" },
          { index: 0 },
        );
        yield {
          type: "assistant",
          session_id: "parent",
          message: { content: [{ type: "text", text: output }] },
        };
      } else {
        yield {
          type: "assistant",
          session_id: "child",
          message: { content: [{ type: "text", text: "login is in auth.ts" }] },
        };
      }

      yield { type: "result", subtype: "success" };
    };
    const runs = ClaudeRuns.open(journalPath(), query);
    const followed = await runs.start(
      "run-1",
      "thread-a",
      "look",
      { claude: context() },
      () => undefined,
    );
    const end = await followed.done;
    await runs.close();
    expect(end.type).toBe("response");

    if (end.type === "response")
      expect(JSON.stringify(end.messages)).toContain("login is in auth.ts");
  });

  test("cancels the run", async () => {
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const query: ClaudeQuery = async function* (input) {
      const iterator = input.prompt[Symbol.asyncIterator]();
      await iterator.next();
      yield { type: "assistant", message: { content: [{ type: "text", text: "working" }] } };
      await gate;

      if (input.abortController.signal.aborted) return;

      yield { type: "result", subtype: "success" };
    };
    const runs = ClaudeRuns.open(journalPath(), query);
    const followed = await runs.start(
      "run-1",
      "thread-a",
      "go",
      { claude: context() },
      () => undefined,
    );
    await followed.cancel();
    release();
    const end = await followed.done;
    await runs.close();
    expect(end).toMatchObject({ type: "error", error: "The run was cancelled" });
  });

  test("answers a question after the query has ended by resuming the session", async () => {
    const inputs: ClaudeQueryInput[] = [];
    let closed = false;
    const query: ClaudeQuery = async function* (input) {
      inputs.push(input);
      const iterator = input.prompt[Symbol.asyncIterator]();
      const first = await iterator.next();
      const text = first.done ? "" : String(first.value);

      if (inputs.length > 1) {
        yield {
          type: "assistant",
          session_id: "sess-q",
          message: { content: [{ type: "text", text }] },
        };
        yield { type: "result", subtype: "success", session_id: "sess-q" };
        return;
      }

      yield { type: "assistant", session_id: "sess-q", message: { content: [] } };
      const pending = input.tools.onPark?.({
        name: "ask_user",
        questions: [{ id: "color", text: "Which color?" }],
      });
      pending?.catch(() => {
        closed = true;
      });
      yield { type: "result", subtype: "success", session_id: "sess-q" };
    };
    const runs = ClaudeRuns.open(journalPath(), query);
    const followed = await runs.start(
      "run-1",
      "thread-a",
      "ask",
      { claude: context() },
      () => undefined,
    );
    const parked = await followed.done;
    for (let i = 0; i < 50 && !closed; i += 1) await Bun.sleep(10);
    expect(closed).toBe(true);
    expect(parked.type).toBe("interaction");
    const continuation = parked.type === "interaction" ? parked.continuation : undefined;
    const asked = parseAgentContinuation(continuation);
    const resumed = await runs.answer(
      { runId: "run-1", agentId: asked.agentId },
      { id: asked.interaction.id, toolCallId: asked.interaction.toolCallId },
      { type: "tool-question", answers: [{ questionId: "color", value: "red" }] },
      () => ({ claude: context() }),
      () => undefined,
    );
    const end = await resumed.done;
    await runs.close();
    expect(inputs[1]?.sessionId).toBe("sess-q");
    expect(end.type).toBe("response");

    if (end.type === "response") expect(JSON.stringify(end.messages)).toContain("color: red");
  });
});

function driverFor(query: ClaudeQuery) {
  const path = journalPath();
  const backend = ClaudeRuns.open(path, query);
  const db = openRunDatabase(path);
  const records = new RunRecords(db);
  const outbox = new RunOutbox(db);
  const reported: RuntimeToControlPlane[] = [];
  const sandbox: ThreadWorkspaces = {
    async acquire() {
      return { tools: [], hasRunningProcesses: async () => false, processes: noProcesses };
    },
    workspace: async () => "/work",
    async release() {},
    async dispose() {},
  };
  const driver = createRunDriver({
    backend: (kind) => backendFor(new Map([["claude", Promise.resolve(backend)]]), kind),
    records,
    outbox,
    sandbox,
    createAgent: () => ({ agent: {} as never }),
    call: async () => null as never,
    report: (runId, make) => {
      const message = outbox.push(runId, make);

      if (message) reported.push(message);
    },
    boxes: new Map(),
    starting: async () => {},
    finished: () => {},
    controlPlane: "http://localhost",
    stopped: () => false,
  });
  return { driver, reported, backend };
}

function start(runId: string, threadId: string): RunMessage {
  return {
    type: "run.start",
    runId,
    thread: { id: threadId, organizationId: "org-1" },
    prompt: "look here",
    backend: "claude",
    claudeToken: TOKEN,
  };
}

describe("Claude runs with the same preparation as native", () => {
  test("gives the query the sandbox tools, skills, variables, attachments and a process ending", async () => {
    const signed: string[] = [];
    const projectEnv: string[] = [];
    let started = 0;
    const seen: ClaudeQueryInput[] = [];
    const prompts: string[] = [];
    let release = () => {};
    const ready = new Promise<void>((resolve) => {
      release = resolve;
    });
    let steered = () => {};
    const steerSent = new Promise<void>((resolve) => {
      steered = resolve;
    });
    const query: ClaudeQuery = async function* (input) {
      seen.push(input);
      const iterator = input.prompt[Symbol.asyncIterator]();
      const first = await iterator.next();

      if (!first.done) prompts.push(String(first.value));

      const exec = input.tools.catalog?.find((tool) => tool.name === "exec_command");
      const ran = await exec?.call(
        { command: "pwd" },
        { abortSignal: input.abortController.signal },
      );
      prompts.push(JSON.stringify(ran));
      await callAvenTool("show_artifact", { path: "page.html" }, input.tools);
      yield {
        type: "assistant",
        session_id: "sess-rich",
        message: {
          content: [
            {
              type: "tool_use",
              id: "art",
              name: "mcp__aven__show_artifact",
              input: { path: "page.html" },
            },
          ],
        },
      };
      yield {
        type: "user",
        message: { content: [{ type: "tool_result", tool_use_id: "art", content: "shown" }] },
      };
      release();
      await steerSent;
      yield { type: "result", subtype: "success", session_id: "sess-rich" };
      const second = await iterator.next();

      if (!second.done) prompts.push(String(second.value));

      yield {
        type: "assistant",
        session_id: "sess-rich",
        message: { content: [{ type: "text", text: "continued" }] },
      };
      yield { type: "result", subtype: "success", session_id: "sess-rich" };
    };
    const sandboxTool = (name: string) =>
      createTool({
        name,
        description: name,
        inputSchema: z.object({
          command: z.string().optional(),
          path: z.string().optional(),
        }),
        async execute(args) {
          if (name === "show_artifact") {
            return {
              artifacts: [
                { name: "page.html", mediaType: "text/html" },
                { name: "clip.mp4", mediaType: "video/mp4" },
              ],
            };
          }

          return { stdout: args.command ?? name };
        },
      });
    const sandbox: ThreadWorkspaces = {
      async acquire() {
        return {
          tools: [
            "exec_command",
            "read_file",
            "write_file",
            "list_files",
            "edit",
            "view_image",
            "show_artifact",
            "start_process",
            "list_processes",
            "read_process_logs",
            "stop_process",
            "wait_for_port",
            "list_ports",
          ].map(sandboxTool),
          hasRunningProcesses: async () => false,
          processes: noProcesses,
          start: async () => {
            started += 1;
          },
        };
      },
      workspace: async () => "/work",
      async signInGithub(_threadId, github) {
        signed.push(github?.login ?? "");
      },
      async signInIdentity(_threadId, identity) {
        signed.push(identity?.credential ?? "");
      },
      setProjectEnv(_threadId, env) {
        for (const variable of env ?? []) projectEnv.push(variable.name);
      },
      artifacts: {
        async save() {
          return "saved";
        },
        async keep() {},
        async read() {
          return null;
        },
      },
      uploads: {
        async save(_threadId, name) {
          return `/uploads/${name}`;
        },
      },
      skills: {
        async install() {
          return [{ name: "review", description: "Review a change", path: "/skills/review" }];
        },
      },
      async release() {},
      async dispose() {},
    };
    const { driver, reported } = driverWith(query, sandbox);
    const running = driver.start({
      type: "run.start",
      runId: "run-rich",
      thread: { id: "thread-rich", organizationId: "org-1" },
      prompt: "look at the notes",
      backend: "claude",
      claudeToken: TOKEN,
      claudeModel: "claude-opus-4-8",
      claudeEffort: "high",
      attachments: [
        {
          name: "notes.txt",
          mediaType: "text/plain",
          size: 4,
          data: Buffer.from("note").toString("base64"),
        },
      ],
      skills: [{ name: "review", description: "Review a change", digest: "a".repeat(64) }],
      env: [{ name: "API_URL", value: "https://example.test" }],
      github: { token: "ghs", id: 1, login: "octo", name: "Octo" },
      identity: { credential: "oidc-cred" },
      mcp: [
        {
          id: "mcp-1",
          name: "Docs",
          url: "http://127.0.0.1:9",
          headers: {},
          allowLocal: false,
        },
      ],
      memory: { folders: [], writable: false },
      cockpit: "read",
      webSearch: { apiKey: "tvly-test" },
    });
    await ready;
    expect(
      await driver.steer({
        runId: "run-rich",
        steerId: "s1",
        prompt: "[process] Process p1 (bun test) ended with exit code 0 after 1s.",
      }),
    ).toEqual({ status: "queued" });
    steered();
    await running;
    const names = seen[0]?.tools.catalog?.map((tool) => tool.name) ?? [];
    expect(names).toEqual(
      expect.arrayContaining([
        "exec_command",
        "read_file",
        "write_file",
        "edit",
        "view_image",
        "show_artifact",
        "start_process",
        "git_fetch",
        "memory",
        "cockpit",
        "define_goal",
        "spawn_agent",
        "fork_thread",
      ]),
    );
    expect(seen[0]?.model).toBe("claude-opus-4-8");
    expect(seen[0]?.effort).toBe("high");
    expect(seen[0]?.env).toEqual([{ name: "API_URL", value: "https://example.test" }]);
    expect(seen[0]?.tools.webSearch).toEqual({ apiKey: "tvly-test" });
    expect(seen[0]?.instructions).toContain("review");
    expect(seen[0]?.instructions).toContain("API_URL");
    expect(seen[0]?.instructions).toContain("Docs");
    expect(prompts[0]).toContain("/uploads/notes.txt");
    expect(prompts[1]).toContain("pwd");
    expect(prompts[2]).toContain("[process] Process p1");
    expect(JSON.stringify(reported)).toContain("text/html");
    expect(JSON.stringify(reported)).toContain("video/mp4");
    expect(signed).toEqual(["octo", "oidc-cred"]);
    expect(projectEnv).toEqual(["API_URL"]);
    expect(started).toBe(1);
    expect(JSON.stringify(reported)).not.toContain(TOKEN);
  });

  test("compacts without starting the sandbox when the thread has no session", async () => {
    let started = 0;
    let queried = 0;
    const query: ClaudeQuery = async function* () {
      queried += 1;
      yield { type: "result", subtype: "success" };
    };
    const sandbox: ThreadWorkspaces = {
      async acquire() {
        started += 1;
        return { tools: [], hasRunningProcesses: async () => false, processes: noProcesses };
      },
      workspace: async () => "/work",
      async release() {},
      async dispose() {},
    };
    const { driver, reported } = driverWith(query, sandbox);
    await driver.start({
      type: "run.start",
      runId: "compact-1",
      thread: { id: "thread-compact", organizationId: "org-1" },
      prompt: "look here",
      backend: "claude",
      claudeToken: TOKEN,
      compact: true,
    });
    expect(started).toBe(0);
    expect(queried).toBe(0);
    expect(JSON.stringify(reported)).toContain(NOTHING_TO_COMPACT);
  });
});

function driverWith(query: ClaudeQuery, sandbox: ThreadWorkspaces) {
  const path = journalPath();
  const backend = ClaudeRuns.open(path, query);
  const db = openRunDatabase(path);
  const records = new RunRecords(db);
  const outbox = new RunOutbox(db);
  const reported: RuntimeToControlPlane[] = [];
  const driver = createRunDriver({
    backend: (kind) => backendFor(new Map([["claude", Promise.resolve(backend)]]), kind),
    records,
    outbox,
    sandbox,
    createAgent: () => ({ agent: {} as never }),
    call: async () => null as never,
    report: (runId, make) => {
      const message = outbox.push(runId, make);

      if (message) reported.push(message);
    },
    boxes: new Map(),
    starting: async () => {},
    finished: () => {},
    controlPlane: "http://localhost",
    stopped: () => false,
  });
  return { driver, reported, backend };
}
