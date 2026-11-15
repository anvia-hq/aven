import { createTool } from "@anvia/core";
import { parseAgentContinuation } from "@anvia/core/agent/interactions";
import { NOTHING_TO_COMPACT } from "@aven/agents/compaction-agent";
import { describe, expect, test } from "bun:test";
import { z } from "zod";

import { backendFor } from "./agent-backends";
import { callAvenTool } from "@aven/codex/codex-mcp";
import { CodexRuns } from "@aven/codex/codex-backend";
import { createRunDriver } from "./run-driver";
import { RunOutbox, openRunDatabase } from "./run-outbox";
import { RunRecords } from "./run-records";
import { journalPath } from "@aven/agent-backend/testing/journal-path";
import { noProcesses } from "./thread-processes";
import type { RuntimeToControlPlane } from "@aven/protocol/types";
import type {
  CodexQuery,
  CodexQueryInput,
  CodexRunContext,
  CodexSdkEvent,
  CodexUsage,
} from "@aven/agent-backend/types";
import type { RunMessage, ThreadWorkspaces } from "./types";

const TOKEN = "sk-codex-parity-thread-0001";

const context = (extra: Partial<CodexRunContext> = {}): CodexRunContext => ({
  token: TOKEN,
  workspace: async () => "/work",
  redact: (text) => text,
  env: [],
  tools: {},
  ...extra,
});

const usage = (extra: Partial<CodexUsage> = {}): CodexUsage => ({
  input_tokens: 2,
  cached_input_tokens: 0,
  output_tokens: 1,
  reasoning_output_tokens: 0,
  ...extra,
});

function turn(sessionId: string, text: string): CodexSdkEvent[] {
  return [
    { type: "thread.started", thread_id: sessionId },
    { type: "item.completed", item: { id: "m", type: "agent_message", text } },
    { type: "turn.completed", usage: usage() },
  ];
}

function scripted(text = "done"): { query: CodexQuery; inputs: CodexQueryInput[] } {
  const inputs: CodexQueryInput[] = [];
  const query: CodexQuery = (input) => {
    inputs.push(input);
    const sessionId = input.sessionId ?? "sess-parity";
    const stream = (async function* () {
      for (const event of turn(sessionId, `${text} ${input.prompt}`)) yield event;
    })();
    return stream;
  };
  return { query, inputs };
}

describe("Codex parity with the Claude agent", () => {
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
    const inputs: CodexQueryInput[] = [];
    const query: CodexQuery = (input) => {
      inputs.push(input);
      const stream = (async function* () {
        yield { type: "thread.started" as const, thread_id: "sess-ask" };
        yield {
          type: "item.started" as const,
          item: {
            id: "q1",
            type: "mcp_tool_call" as const,
            server: "aven",
            tool: "ask_user",
            arguments: questions,
            status: "in_progress" as const,
          },
        };
        const answer = await callAvenTool("ask_user", questions, input.tools);
        yield {
          type: "item.completed" as const,
          item: {
            id: "q1",
            type: "mcp_tool_call" as const,
            server: "aven",
            tool: "ask_user",
            arguments: questions,
            status: "completed" as const,
            result: { content: [{ type: "text", text: answer }] },
          },
        };
        yield {
          type: "item.completed" as const,
          item: { id: "reply", type: "agent_message" as const, text: "Going with the answer" },
        };
        yield { type: "turn.completed" as const, usage: usage() };
      })();
      return stream;
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
      backend: "codex",
      codexToken: TOKEN,
    });
    await backend.close();
    const ends = reported.filter((message) => message.type === "run.end");
    expect(ends.at(-1)).toMatchObject({ outcome: "response" });
    expect(JSON.stringify(reported)).toContain("color: red");
    expect(inputs).toHaveLength(1);
  });

  test("runs a goal session and completes when the checks pass", async () => {
    const { query, inputs } = scripted("shipped");
    const runs = CodexRuns.open(journalPath(), query);
    const goal = await runs.startGoal({
      runId: "goal-1",
      request: {
        objective: "Ship it",
        acceptanceCriteria: ["tests pass"],
        verifyCommands: ["bun test"],
      },
      input: { codex: context({ questions: false }) },
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
    const runs = CodexRuns.open(journalPath(), query);
    const goal = await runs.startGoal({
      runId: "goal-2",
      request: {
        objective: "Make the tests pass",
        acceptanceCriteria: ["tests pass"],
        verifyCommands: ["bun test"],
        maxSessions: 3,
      },
      input: { codex: context({ questions: false }) },
      verify: async () => [{ command: "bun test", exitCode: 1, output: "fail" }],
      onEvent: () => undefined,
      onSession: async () => undefined,
    });
    const end = await goal.done;
    await runs.close();
    expect(end).toMatchObject({ type: "paused", reason: "no_progress" });
  });

  test("a message sent to a goal is reported as applied once the goal takes it", async () => {
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const query: CodexQuery = (input) => {
      const stream = (async function* () {
        yield { type: "thread.started" as const, thread_id: "sess-goal" };
        await gate;
        yield {
          type: "item.completed" as const,
          item: { id: "m", type: "agent_message" as const, text: `still failing ${input.prompt}` },
        };
        yield { type: "turn.completed" as const, usage: usage() };
      })();
      return stream;
    };
    const runs = CodexRuns.open(journalPath(), query);
    const events: { type: string; id?: string }[] = [];
    const goal = await runs.startGoal({
      runId: "goal-3",
      request: {
        objective: "Make the tests pass",
        acceptanceCriteria: ["tests pass"],
        verifyCommands: ["bun test"],
        maxSessions: 2,
      },
      input: { codex: context({ questions: false }) },
      verify: async () => [{ command: "bun test", exitCode: 1, output: "fail" }],
      onEvent: (event) => void events.push(event),
      onSession: async () => undefined,
    });
    await goal.steer("also keep commits atomic", "steer-1");
    release();
    await goal.done;
    await runs.close();
    expect(events.filter((event) => event.type === "steer_applied")).toEqual([
      { type: "steer_applied", id: "steer-1" },
    ]);
  });

  test("continues an interrupted run on the same Codex session", async () => {
    const { query, inputs } = scripted("hello");
    const runs = CodexRuns.open(journalPath(), query);
    const started = await runs.start(
      "run-1",
      "thread-a",
      "look",
      { codex: context() },
      () => undefined,
    );
    await started.done;
    const again = await runs.rejoin(started.durableId, { codex: context() }, 0, () => undefined);
    await again.done;
    await runs.close();
    expect(inputs[1]?.sessionId).toBe("sess-parity");
    expect(inputs[1]?.prompt).toContain("The runner restarted");
  });

  test("compacts a session and says when there is nothing to compact", async () => {
    const { query, inputs } = scripted("hello");
    const runs = CodexRuns.open(journalPath(), query);
    const events: string[] = [];
    const empty = await runs.start(
      "run-1",
      "thread-a",
      "/compact",
      { codex: context({ compact: true }) },
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
      { codex: context() },
      () => undefined,
    );
    await first.done;
    const compacted: string[] = [];
    const compact = await runs.start(
      "run-3",
      "thread-a",
      "ignored",
      { codex: context({ compact: true }) },
      (event) => {
        if (event.type === "text") compacted.push(event.delta);
      },
    );
    await compact.done;
    await runs.close();
    expect(inputs.at(-1)?.sessionId).toBe("sess-parity");
    expect(compacted.join("")).toContain("Compact this conversation");
  });

  test("reports a failed turn and the model's usage", async () => {
    const query: CodexQuery = () => {
      const stream = (async function* () {
        yield {
          type: "turn.completed" as const,
          usage: usage({ input_tokens: 9, output_tokens: 4 }),
        };
        yield { type: "turn.failed" as const, error: { message: "The model stopped" } };
      })();
      return stream;
    };
    const runs = CodexRuns.open(journalPath(), query);
    const events: RuntimeToControlPlane[] = [];
    const followed = await runs.start("run-1", "thread-a", "go", { codex: context() }, (event) => {
      events.push({ type: "run.event", runId: "run-1", seq: events.length, event });
    });
    const end = await followed.done;
    await runs.close();
    expect(end).toMatchObject({ type: "error", error: "The model stopped" });
    expect(
      events.some((message) => message.type === "run.event" && message.event.type === "usage"),
    ).toBe(true);
  });

  test("uses the model the person chose", async () => {
    const { query, inputs } = scripted();
    const runs = CodexRuns.open(journalPath(), query);
    const followed = await runs.start(
      "run-1",
      "thread-a",
      "go",
      { codex: context({ model: "terra", effort: "high" }) },
      () => undefined,
    );
    await followed.done;
    await runs.close();
    expect(inputs[0]?.model).toBe("terra");
    expect(inputs[0]?.effort).toBe("high");
  });

  test("a subagent works on its own and reports back", async () => {
    const query: CodexQuery = (input) => {
      const stream = (async function* () {
        if (input.tools.runSubagent) {
          const output = await input.tools.runSubagent(
            { description: "Find auth", prompt: "Where is login?", type: "explore" },
            { index: 0 },
          );
          yield { type: "thread.started" as const, thread_id: "parent" };
          yield {
            type: "item.completed" as const,
            item: { id: "m", type: "agent_message" as const, text: output },
          };
        } else {
          yield { type: "thread.started" as const, thread_id: "child" };
          yield {
            type: "item.completed" as const,
            item: { id: "m", type: "agent_message" as const, text: "login is in auth.ts" },
          };
        }

        yield { type: "turn.completed" as const, usage: usage() };
      })();
      return stream;
    };
    const runs = CodexRuns.open(journalPath(), query);
    const followed = await runs.start(
      "run-1",
      "thread-a",
      "look",
      { codex: context() },
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
    const query: CodexQuery = (input) => {
      const stream = (async function* () {
        yield {
          type: "item.completed" as const,
          item: { id: "m", type: "agent_message" as const, text: "working" },
        };
        await gate;

        if (input.abortController.signal.aborted) return;

        yield { type: "turn.completed" as const, usage: usage() };
      })();
      return Object.assign(stream, {
        close() {
          input.abortController.abort();
        },
      });
    };
    const runs = CodexRuns.open(journalPath(), query);
    const followed = await runs.start(
      "run-1",
      "thread-a",
      "go",
      { codex: context() },
      () => undefined,
    );
    await followed.cancel();
    release();
    const end = await followed.done;
    await runs.close();
    expect(end).toMatchObject({ type: "error", error: "The run was cancelled" });
  });

  test("answers a question after the query has ended by resuming the session", async () => {
    const inputs: CodexQueryInput[] = [];
    let closed = false;
    const query: CodexQuery = (input) => {
      inputs.push(input);
      const stream = (async function* () {
        const sessionId = input.sessionId ?? "sess-q";
        yield { type: "thread.started" as const, thread_id: sessionId };

        if (inputs.length > 1) {
          yield {
            type: "item.completed" as const,
            item: { id: "m", type: "agent_message" as const, text: input.prompt },
          };
          yield { type: "turn.completed" as const, usage: usage() };
          return;
        }

        const pending = input.tools.onPark?.({
          name: "ask_user",
          questions: [{ id: "color", text: "Which color?" }],
        });
        pending?.catch(() => {
          closed = true;
        });
        yield { type: "turn.completed" as const, usage: usage() };
      })();
      return stream;
    };
    const runs = CodexRuns.open(journalPath(), query);
    const followed = await runs.start(
      "run-1",
      "thread-a",
      "ask",
      { codex: context() },
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
      () => ({ codex: context() }),
      () => undefined,
    );
    const end = await resumed.done;
    await runs.close();
    expect(inputs[1]?.sessionId).toBe("sess-q");
    expect(end.type).toBe("response");

    if (end.type === "response") expect(JSON.stringify(end.messages)).toContain("color: red");
  });
});

function driverFor(query: CodexQuery) {
  const path = journalPath();
  const backend = CodexRuns.open(path, query);
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
    backend: (kind) => backendFor(new Map([["codex", Promise.resolve(backend)]]), kind),
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
    backend: "codex",
    codexToken: TOKEN,
  };
}

describe("Codex runs with the same preparation as Claude", () => {
  test("gives the query the sandbox tools, skills, variables, attachments and a process ending", async () => {
    const signed: string[] = [];
    const projectEnv: string[] = [];
    let started = 0;
    const seen: CodexQueryInput[] = [];
    const prompts: string[] = [];
    let release = () => {};
    const ready = new Promise<void>((resolve) => {
      release = resolve;
    });
    let steered = () => {};
    const steerSent = new Promise<void>((resolve) => {
      steered = resolve;
    });
    const query: CodexQuery = (input) => {
      seen.push(input);
      const stream = (async function* () {
        prompts.push(input.prompt);
        const exec = input.tools.catalog?.find((tool) => tool.name === "exec_command");
        const ran = await exec?.call(
          { command: "pwd" },
          { abortSignal: input.abortController.signal },
        );
        prompts.push(JSON.stringify(ran));
        await callAvenTool("show_artifact", { path: "page.html" }, input.tools);
        yield { type: "thread.started" as const, thread_id: "sess-rich" };
        yield {
          type: "item.completed" as const,
          item: {
            id: "art",
            type: "mcp_tool_call" as const,
            server: "aven",
            tool: "show_artifact",
            arguments: { path: "page.html" },
            status: "completed" as const,
            result: { content: [{ type: "text", text: "shown" }] },
          },
        };
        release();
        await steerSent;

        if (seen.length === 1) {
          yield { type: "turn.completed" as const, usage: usage() };
          return;
        }

        yield {
          type: "item.completed" as const,
          item: { id: "m", type: "agent_message" as const, text: "continued" },
        };
        yield { type: "turn.completed" as const, usage: usage() };
      })();
      return stream;
    };
    const sandboxTool = (name: string) =>
      createTool({
        name,
        description: name,
        inputSchema: z.object({
          command: z.string().optional(),
          path: z.string().optional(),
        }),
        async handler(args) {
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
      backend: "codex",
      codexToken: TOKEN,
      codexModel: "terra",
      codexEffort: "high",
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
    expect(seen[0]?.model).toBe("terra");
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
    const query: CodexQuery = () => {
      queried += 1;
      const stream = (async function* () {
        yield { type: "turn.completed" as const, usage: usage() };
      })();
      return stream;
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
      backend: "codex",
      codexToken: TOKEN,
      compact: true,
    });
    expect(started).toBe(0);
    expect(queried).toBe(0);
    expect(JSON.stringify(reported)).toContain(NOTHING_TO_COMPACT);
  });
});

function driverWith(query: CodexQuery, sandbox: ThreadWorkspaces) {
  const path = journalPath();
  const backend = CodexRuns.open(path, query);
  const db = openRunDatabase(path);
  const records = new RunRecords(db);
  const outbox = new RunOutbox(db);
  const reported: RuntimeToControlPlane[] = [];
  const driver = createRunDriver({
    backend: (kind) => backendFor(new Map([["codex", Promise.resolve(backend)]]), kind),
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
