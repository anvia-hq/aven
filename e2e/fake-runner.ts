import { WIRE_VERSION } from "../packages/protocol/src/runtime-wire";
import { decodeViewerFrame, encodeViewerFrame } from "../packages/protocol/src/viewer-frame";
import { readFakeRunnerConfig } from "./fake-runner-config";
import type { ControlPlaneToRuntime } from "../packages/protocol/src/types";
import type { FakeRunnerRun } from "./types";

const base = process.env.AVEN_URL!;
const token = process.env.AVEN_RUNTIME_TOKEN!;
const config = readFakeRunnerConfig(process.env);

type Asked = {
  id: string;
  text: string;
  choices?: { label: string; value: string }[];
  allowCustom?: boolean;
};

const COLOR_QUESTION: Asked = {
  id: "color",
  text: "Which color should it be?",
  choices: [
    { label: "Red", value: "red" },
    { label: "Blue", value: "blue" },
  ],
  allowCustom: true,
};
const SIZE_QUESTION: Asked = {
  id: "size",
  text: "How big is it?",
  choices: [
    { label: "Small", value: "small" },
    { label: "Large", value: "large" },
  ],
  allowCustom: false,
};
const SECRET_QUESTION: Asked = { id: "STRIPE_API_KEY", text: "What is the Stripe test key?" };

const askedOf = (count: 1 | 2) =>
  count === 2 ? [SIZE_QUESTION, COLOR_QUESTION] : [COLOR_QUESTION];

function askedBy(run: FakeRunnerRun): { name: string; questions: Asked[] } | null {
  if (run.kind === "secret") return { name: "request_secret", questions: [SECRET_QUESTION] };

  if (run.kind === "questions") return { name: "ask_user", questions: askedOf(run.count) };

  return null;
}

const asking = askedBy(config.run);
const stream = config.run.kind === "stream" ? config.run : null;
const plain = config.run.kind === "plain" ? config.run : null;

const event = (value: object) => console.log(`EVENT ${JSON.stringify(value)}`);
const text = (value: string) => new TextEncoder().encode(value);

const ws = new WebSocket(`${base.replace(/^http/, "ws").replace(/\/$/, "")}/runtimes/connect`, {
  headers: { authorization: `Bearer ${token}` },
} as unknown as string[]);
ws.binaryType = "arraybuffer";
const terminals = new Map<string, { line: string }>();

const send = (message: object) => ws.send(JSON.stringify(message));

const seqs = new Map<string, number>();
const streamed = new Map<string, number>();
const ended = new Set<string>();
const numbered = (runId: string) => {
  const seq = (seqs.get(runId) ?? 0) + 1;
  seqs.set(runId, seq);
  return seq;
};

type Sandbox = {
  running: boolean;
};

const sandboxes = new Map<string, Sandbox>();

function sandboxFor(threadId: string): Sandbox {
  const known = sandboxes.get(threadId);

  if (known) return known;

  const made: Sandbox = { running: config.sandboxStartsRunning };
  sandboxes.set(threadId, made);
  return made;
}

ws.onopen = () => {
  send({
    type: "hello",
    version: WIRE_VERSION,
    runs: [],
    backends: ["native", "claude"],
    build: config.self.build,
    canUpdate: config.self.canUpdate ? true : undefined,
    host: config.self.dirs.length > 0 ? true : undefined,
    dirs: config.self.dirs.length > 0 ? config.self.dirs : undefined,
  });

  if (config.self.stats) send({ type: "host.stats", stats: JSON.parse(config.self.stats) });
};
ws.onmessage = ({ data }) => {
  if (data instanceof ArrayBuffer) {
    const frame = decodeViewerFrame(new Uint8Array(data));

    if (!frame) return;

    const terminal = terminals.get(frame.viewerId);

    if (terminal) {
      const reply = (value: string) => ws.send(encodeViewerFrame(frame.viewerId, text(value)));
      for (const char of new TextDecoder().decode(frame.payload)) {
        if (char === "\r") {
          reply(`\r\nran: ${terminal.line}\r\nfake$ `);
          terminal.line = "";
        } else {
          terminal.line += char;
          reply(char);
        }
      }
    }

    return;
  }

  const message = JSON.parse(String(data)) as ControlPlaneToRuntime;

  if (message.type === "terminal.open") {
    const { viewerId, threadId, cols, rows } = message;

    if (!sandboxFor(threadId).running) {
      send({ type: "terminal.closed", viewerId, reason: "The sandbox is not running" });
      return;
    }

    event({ type: "terminal.open", cols, rows });
    terminals.set(viewerId, { line: "" });
    send({ type: "terminal.opened", viewerId });
    ws.send(encodeViewerFrame(viewerId, text("fake$ ")));
  } else if (message.type === "terminal.resize") {
    event({ type: "terminal.resize", cols: message.cols, rows: message.rows });
  } else if (message.type === "terminal.close") {
    terminals.delete(message.viewerId);
  } else if (message.type === "call") {
    answer(message);
  } else if (message.type === "run.cancel") {
    const { runId } = message;
    ended.add(runId);
    event({ type: "cancelled", runId });
    send({
      type: "run.end",
      runId,
      seq: numbered(runId),
      outcome: "error",
      error: "Cancelled by user",
    });
  } else if (message.type === "run.start" && config.run.kind === "subagents") {
    const { runId } = message;
    const say = (event: unknown) =>
      send({ type: "run.event", runId, seq: numbered(runId), event } as never);
    const tool = (id: string, name: string, target: string) => ({
      id,
      name,
      target,
      status: "running",
    });
    const subagent = (index: number, description: string, type: string) => ({
      index,
      description,
      type,
      status: "running",
      tools: [],
    });
    say({ type: "text", delta: "Looking into it." });
    say({
      type: "tool_start",
      tool: {
        id: "s1",
        name: "spawn_agent",
        target: "2 tasks",
        status: "running",
        subagents: [
          subagent(0, "Find the auth middleware", "explore"),
          subagent(1, "Add a test", "general"),
        ],
      },
    });
    say({
      type: "subagent",
      index: 0,
      event: { type: "tool_start", tool: tool("a1", "read_file", "src/auth.ts") },
    });
    say({ type: "subagent", index: 0, event: { type: "tool_end", id: "a1", status: "done" } });
    say({
      type: "subagent",
      index: 0,
      event: { type: "end", status: "done", output: "Auth lives in **src/auth.ts**." },
    });
    say({
      type: "subagent",
      index: 1,
      event: { type: "end", status: "error", output: "The model refused." },
    });
    say({ type: "tool_end", id: "s1", status: "done", output: "1 finished, 1 failed" });
    say({ type: "text", delta: "Auth is in src/auth.ts; the test could not be written." });
    send({ type: "run.end", runId, seq: numbered(runId), outcome: "response" });
  } else if (message.type === "run.start" && stream?.unit === "word") {
    const { runId } = message;
    const timer = setInterval(() => {
      const word = (streamed.get(runId) ?? 0) + 1;
      streamed.set(runId, word);

      if (word > stream.count) {
        clearInterval(timer);
        send({ type: "run.end", runId, seq: numbered(runId), outcome: "response" });
        return;
      }

      let gap = " ";

      if (word === 1) gap = "";
      else if (word % 30 === 1) gap = "\n\n";

      send({
        type: "run.event",
        runId,
        seq: numbered(runId),
        event: { type: "text", delta: `${gap}word${word}-streams` },
      });
    }, stream.everyMs);
  } else if (message.type === "run.start" && stream?.unit === "line") {
    const { runId } = message;
    const timer = setInterval(() => {
      const line = (streamed.get(runId) ?? 0) + 1;
      streamed.set(runId, line);

      if (line > stream.count) {
        clearInterval(timer);
        send({ type: "run.end", runId, seq: numbered(runId), outcome: "response" });
        return;
      }

      send({
        type: "run.event",
        runId,
        seq: numbered(runId),
        event: {
          type: "text",
          delta: `${line === 1 ? "Here is the plan, one step per line.\n\n" : ""}- Step ${line}: checking the next file and noting what it does.\n`,
        },
      });
    }, stream.everyMs);
  } else if (message.type === "run.start" && plain) {
    event({
      type: "started",
      prompt: message.prompt,
      mentions: message.mentions,
      compact: message.compact,
    });

    if (plain.limits) {
      send({
        type: "run.event",
        runId: message.runId,
        seq: numbered(message.runId),
        event: { type: "limits", limits: JSON.parse(plain.limits) },
      });
    }

    const finish = () => {
      const { runId } = message;

      if (ended.has(runId)) return;

      ended.add(runId);

      if (plain.failure) {
        send({
          type: "run.end",
          runId,
          seq: numbered(runId),
          outcome: "error",
          error: plain.failure,
        });
        return;
      }

      send({
        type: "run.event",
        runId,
        seq: numbered(runId),
        event: { type: "text", delta: "Done." },
      });
      send({ type: "run.end", runId, seq: numbered(runId), outcome: "response" });
    };

    if (plain.ending.kind === "at-once") finish();
    else if (plain.ending.kind === "after") setTimeout(finish, plain.ending.ms);
  } else if (message.type === "run.start" && asking) {
    const { runId } = message;
    const ask = {
      id: "q1",
      name: asking.name,
      target: "",
      status: "running",
      questions: asking.questions,
    };
    send({
      type: "run.event",
      runId,
      seq: numbered(runId),
      event: { type: "text", delta: "One question first." },
    });
    send({
      type: "run.event",
      runId,
      seq: numbered(runId),
      event: { type: "tool_start", tool: ask },
    });
    send({
      type: "run.end",
      runId,
      seq: numbered(runId),
      outcome: "interaction",
      continuation: {
        version: 1,
        agentId: "coding",
        sourceRunId: runId,
        interaction: {
          type: "tool-question",
          id: "i1",
          toolName: asking.name,
          toolCallId: "q1",
          internalCallId: "c1",
          questions: asking.questions,
        },
        state: {},
      },
    });
  } else if (message.type === "run.resume" && asking) {
    const { runId, response } = message;
    event({ type: "answered", response, env: message.env });
    const output = JSON.stringify({ answers: (response as { answers: unknown }).answers });
    send({
      type: "run.event",
      runId,
      seq: numbered(runId),
      event: { type: "tool_end", id: "q1", status: "done", output },
    });
    send({
      type: "run.event",
      runId,
      seq: numbered(runId),
      event: { type: "text", delta: "Thanks, on it." },
    });
    send({ type: "run.end", runId, seq: numbered(runId), outcome: "response" });
  }
};

const TURN_PATCH = `diff --git a/src/greeting.ts b/src/greeting.ts
index 1111111..2222222 100644
--- a/src/greeting.ts
+++ b/src/greeting.ts
@@ -1,3 +1,3 @@
 export function greet() {
-  return "hello";
+  return "hello, world";
 }
`;
const ALL_ONLY_PATCH = `diff --git a/README.md b/README.md
new file mode 100644
index 0000000..3333333
--- /dev/null
+++ b/README.md
@@ -0,0 +1 @@
+# Notes
`;

const bigPatch = (lines: number) =>
  [
    "diff --git a/src/big.ts b/src/big.ts",
    "new file mode 100644",
    "index 0000000..4444444",
    "--- /dev/null",
    "+++ b/src/big.ts",
    `@@ -0,0 +1,${lines} @@`,
    ...Array.from({ length: lines }, (_, at) => `+export const value${at} = ${at};`),
    "",
  ].join("\n");

const patchFor = (scope: "turn" | "all") => {
  if (config.self.diffLines > 0) return bigPatch(config.self.diffLines);

  return scope === "turn" ? TURN_PATCH : TURN_PATCH + ALL_ONLY_PATCH;
};

const WORKSPACE: Record<string, { name: string; type: "file" | "directory" }[]> = {
  "": [
    { name: "src", type: "directory" },
    { name: "README.md", type: "file" },
  ],
  src: [{ name: "greeting.ts", type: "file" }],
};
const WORKSPACE_FILES: Record<string, string> = {
  "README.md": "# Notes\n",
  "src/greeting.ts": 'export function greet() {\n  return "hello, world";\n}\n',
};

if (config.avenFiles.includes("setup")) WORKSPACE_FILES[".aven/setup"] = "#!/bin/sh\nbun install\n";

if (config.avenFiles.includes("ship")) {
  WORKSPACE_FILES[".aven/ship.md"] = "Commit, push, then open it with gh pr create --draft.\n";
}

if (config.avenFiles.includes("actions")) {
  WORKSPACE_FILES[".aven/actions.yml"] = [
    "actions:",
    "  - name: Test",
    "    run: bun test",
    "  - name: Typecheck",
    "    run: bun run typecheck",
    "  - name: Tidy up",
    "    prompt: Remove dead code and unused imports",
  ].join("\n");
}

type PretendProcess = {
  id: string;
  command: string;
  status: "running" | "exited" | "stopped";
  exitCode?: number;
  startedAt: string;
  endedAt?: string;
};
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const folderTree = new Map<string, string[]>();

const PROCESSES: PretendProcess[] = config.backgroundProcesses
  ? [
      { id: "p1", command: "npm run dev", status: "running", startedAt: ago(180_000) },
      {
        id: "p2",
        command: "bun test",
        status: "exited",
        exitCode: 1,
        startedAt: ago(600_000),
        endedAt: ago(540_000),
      },
    ]
  : [];
const PROCESS_LOGS: Record<string, string> = {
  p1: "ready on http://localhost:3000\n",
  p2: "1 fail\n",
};

function answer(call: Extract<ControlPlaneToRuntime, { type: "call" }>) {
  const params = call.params as { threadId?: string };
  const reply = (result: unknown) => send({ type: "reply", id: call.id, ok: true, result });

  if (call.method === "folders.list") {
    const { path } = call.params as { path?: string };

    if (!path) {
      return reply({
        path: null,
        parent: null,
        folders: config.self.dirs.map((dir) => ({
          name: dir.split("/").pop(),
          path: dir,
          git: false,
        })),
      });
    }

    const root = config.self.dirs.find((dir) => path === dir || path.startsWith(`${dir}/`));

    if (!root) {
      return send({
        type: "reply",
        id: call.id,
        ok: false,
        error: "This runner does not serve that folder",
      });
    }

    const names = folderTree.get(path) ?? (path === root ? ["app", "notes"] : []);
    return reply({
      path,
      parent: path === root ? null : path.slice(0, path.lastIndexOf("/")),
      folders: names.map((name) => ({ name, path: `${path}/${name}`, git: name === "app" })),
    });
  }

  if (call.method === "folders.create") {
    const { path, name } = call.params as { path: string; name: string };
    const names = folderTree.get(path) ?? ["app", "notes"];
    folderTree.set(path, names.concat(name));
    return reply({ path: `${path}/${name}` });
  }

  if (call.method === "folders.clone") {
    const { repository } = call.params as { repository: string };
    const name =
      repository
        .replace(/\.git$/, "")
        .split("/")
        .pop() ?? repository;
    return reply({ path: `${config.self.dirs[0] ?? "/work/code"}/${name}` });
  }

  if (call.method === "folders.files") {
    const { path } = call.params as { path?: string };
    const entries = path
      ? [{ name: "index.ts", path: `${path}/index.ts`, type: "file" }]
      : [
          { name: "src", path: "src", type: "directory" },
          { name: "package.json", path: "package.json", type: "file" },
          { name: "README.md", path: "README.md", type: "file" },
        ];
    return reply({ entries });
  }

  if (call.method === "folders.commits") {
    return reply({
      commits: [
        {
          sha: "b".repeat(40),
          message: "Write the notes",
          author: "Ana",
          authorAvatar: null,
          date: "2026-11-01T10:00:00+07:00",
          parents: ["a".repeat(40)],
          refs: ["main"],
          tags: [],
        },
        {
          sha: "a".repeat(40),
          message: "Start the notes folder",
          author: "Ana",
          authorAvatar: null,
          date: "2026-10-31T10:00:00+07:00",
          parents: [],
          refs: [],
          tags: ["v1"],
        },
      ],
      hasMore: false,
    });
  }

  if (call.method === "folders.readme") {
    return reply({
      readme: {
        name: "README.md",
        path: "README.md",
        text: "# Notes folder\n\nKept on the computer. [Docs](docs/start.md)",
        truncated: false,
      },
    });
  }

  if (call.method === "run.steer") {
    const { runId, steerId, prompt } = call.params as {
      runId: string;
      steerId: string;
      prompt: string;
    };
    event({ type: "steer", prompt });

    if (config.steering.refuseReason) {
      return reply({ status: "refused", reason: config.steering.refuseReason });
    }

    setTimeout(
      () =>
        send({
          type: "run.event",
          runId,
          seq: numbered(runId),
          event: { type: "steer_applied", id: steerId },
        }),
      config.steering.appliesAfterMs,
    );
    return reply({ status: "queued" });
  }

  if (call.method === "diff.get") {
    const { scope } = call.params as { scope: "turn" | "all" };
    return reply({
      patch: patchFor(scope),
      truncated: false,
      branch: config.branch,
    });
  }

  if (config.noWorkspace && call.method.startsWith("files.")) return reply(null);

  if (call.method === "files.list") {
    const { path } = call.params as { path: string };
    return reply({ entries: WORKSPACE[path] ?? [] });
  }

  if (call.method === "files.search") {
    const { query } = call.params as { query: string };
    return reply({ paths: Object.keys(WORKSPACE_FILES).filter((path) => path.includes(query)) });
  }

  if (call.method === "files.read") {
    const { path } = call.params as { path: string };
    const text = WORKSPACE_FILES[path];
    return reply(
      text === undefined
        ? { kind: "missing" }
        : { kind: "text", text, size: text.length, truncated: false },
    );
  }

  if (call.method === "actions.run") {
    const { command } = call.params as { command: string };
    const failing = command.includes("typecheck");
    const started = {
      id: `a${PROCESSES.length + 1}`,
      command,
      status: "exited" as const,
      exitCode: failing ? 2 : 0,
      startedAt: ago(4_000),
      endedAt: ago(1_000),
    };
    PROCESSES.push(started);
    PROCESS_LOGS[started.id] = failing ? "src/greeting.ts(2,3): error TS2322\n" : "7 pass\n";
    return reply({ process: started });
  }

  if (call.method === "processes.list") return reply({ processes: PROCESSES });

  if (call.method === "processes.stop") {
    const { processId } = call.params as { processId: string };
    const found = PROCESSES.find((process) => process.id === processId);

    if (!found) return send({ type: "reply", id: call.id, ok: false, error: "No such process" });

    Object.assign(found, { status: "stopped", endedAt: new Date().toISOString() });
    return reply({ processes: PROCESSES });
  }

  if (call.method === "processes.logs") {
    const { processId } = call.params as { processId: string };
    return reply({ stdout: PROCESS_LOGS[processId] ?? "", stderr: "", truncated: false });
  }

  if (call.method === "runner.update") {
    const { updateBusyReason } = config.self;
    return reply(
      updateBusyReason ? { status: "busy", reason: updateBusyReason } : { status: "started" },
    );
  }

  if (call.method === "process.watch") return reply(null);

  if (call.method === "sandbox.release") {
    const { threadId } = call.params as { threadId: string };
    event({ type: "sandbox.release", threadId });
    const released = sandboxFor(threadId);
    released.running = false;
    return reply({ released: true });
  }

  const sandbox = sandboxFor(params.threadId ?? "");

  if (call.method === "computer.wake") sandbox.running = true;

  if (!sandbox.running) return reply(null);

  reply({ state: "awake" });
}

console.log("READY");
