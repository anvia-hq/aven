// A runner for e2e whose desktop is pretend: it speaks the runtime wire and, for a viewer, a small
// RFB (VNC) server that shows one red screen and reports the keys and clicks it receives. No
// Docker. What it learns is printed as `EVENT {json}` lines for the spec to read.
import { WIRE_VERSION, type ControlPlaneToRuntime } from "../packages/protocol/src/runtime-wire";
import { decodeViewerFrame, encodeViewerFrame } from "../packages/protocol/src/viewer-frame";
import { FakeDesktop, HEIGHT, WIDTH } from "./fake-desktop";

const base = process.env.AVEN_URL!;
const token = process.env.AVEN_RUNTIME_TOKEN!;
// With NO_SANDBOX the thread has no running container, as before its first run; waking it starts one.
let sandboxRunning = process.env.NO_SANDBOX !== "1";

// With FAKE_QUESTION a run asks the user a question and stops (`interaction`), and the answer
// resumes it: the runs of a real agent that used `ask_user`, without a model.
const QUESTIONS = [
  {
    id: "color",
    text: "Which color should it be?",
    choices: [
      { label: "Red", value: "red" },
      { label: "Blue", value: "blue" },
    ],
    allowCustom: true,
  },
];
// With FAKE_SECRET it is a `request_secret` instead (decision 0047): one question whose id is the
// variable to set. What the resumed run is given, the answer and the variables, is printed.
const SECRET = process.env.FAKE_SECRET === "1";
const ASKING = Boolean(process.env.FAKE_QUESTION) || SECRET;
// A run that hands two tasks to subagents (decision 0057), tells what they do, and ends.
const SUBAGENTS = process.env.FAKE_SUBAGENTS === "1";
const ASKED = SECRET ? [{ id: "STRIPE_API_KEY", text: "What is the Stripe test key?" }] : QUESTIONS;
const ASKED_TOOL = SECRET ? "request_secret" : "ask_user";
if (process.env.FAKE_QUESTION === "2") {
  QUESTIONS.unshift({
    id: "size",
    text: "How big is it?",
    choices: [
      { label: "Small", value: "small" },
      { label: "Large", value: "large" },
    ],
    allowCustom: false,
  });
}

const event = (value: object) => console.log(`EVENT ${JSON.stringify(value)}`);
const text = (value: string) => new TextEncoder().encode(value);

const ws = new WebSocket(`${base.replace(/^http/, "ws").replace(/\/$/, "")}/runtimes/connect`, {
  headers: { authorization: `Bearer ${token}` },
} as unknown as string[]);
ws.binaryType = "arraybuffer";
const viewers = new Map<string, FakeDesktop>();
// A pretend shell: it shows a prompt, echoes what is typed and answers each line with `ran: <line>`.
const terminals = new Map<string, { line: string }>();

const send = (message: object) => ws.send(JSON.stringify(message));

// A run's events and its end are numbered from 1 (the wire since version 9).
const seqs = new Map<string, number>();
const numbered = (runId: string) => {
  const seq = (seqs.get(runId) ?? 0) + 1;
  seqs.set(runId, seq);
  return seq;
};

// With FAKE_STATS (the JSON of a `host.stats` message's stats) the runner tells how loaded its
// machine is, as a runner of this release does; without it, as an older runner that never does.
ws.onopen = () => {
  send({ type: "hello", version: WIRE_VERSION, runs: [] });
  if (process.env.FAKE_STATS)
    send({ type: "host.stats", stats: JSON.parse(process.env.FAKE_STATS) });
};
ws.onmessage = ({ data }) => {
  if (data instanceof ArrayBuffer) {
    const frame = decodeViewerFrame(new Uint8Array(data));
    if (!frame) return;
    const terminal = terminals.get(frame.viewerId);
    if (!terminal) viewers.get(frame.viewerId)?.feed(frame.payload);
    else {
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
  if (message.type === "desktop.open") {
    const { viewerId } = message;
    if (!sandboxRunning) {
      send({ type: "desktop.closed", viewerId, reason: "The sandbox is not running" });
      return;
    }
    send({ type: "desktop.opened", viewerId });
    viewers.set(
      viewerId,
      new FakeDesktop((bytes) => ws.send(encodeViewerFrame(viewerId, bytes)), event),
    );
  } else if (message.type === "desktop.close") {
    viewers.delete(message.viewerId);
  } else if (message.type === "terminal.open") {
    const { viewerId, cols, rows } = message;
    if (!sandboxRunning) {
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
  } else if (message.type === "run.start" && SUBAGENTS) {
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
  } else if (message.type === "run.start" && !ASKING) {
    // A plain run is left going, unless FAKE_RUN_ENDS says it finishes; the spec reads what it was given.
    event({
      type: "started",
      prompt: message.prompt,
      mentions: message.mentions,
      compact: message.compact,
    });
    const finish = () => {
      const { runId } = message;
      send({
        type: "run.event",
        runId,
        seq: numbered(runId),
        event: { type: "text", delta: "Done." },
      });
      send({ type: "run.end", runId, seq: numbered(runId), outcome: "response" });
    };
    if (process.env.FAKE_RUN_ENDS) finish();
    // With FAKE_RUN_ENDS_AFTER (milliseconds) it finishes later, while a spec is elsewhere.
    else if (process.env.FAKE_RUN_ENDS_AFTER)
      setTimeout(finish, Number(process.env.FAKE_RUN_ENDS_AFTER));
  } else if (message.type === "run.start" && ASKING) {
    const { runId } = message;
    const ask = {
      id: "q1",
      name: ASKED_TOOL,
      target: "",
      status: "running",
      questions: ASKED,
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
          toolName: ASKED_TOOL,
          toolCallId: "q1",
          internalCallId: "c1",
          questions: ASKED,
        },
        state: {},
      },
    });
  } else if (message.type === "run.resume" && ASKING) {
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

// What the pretend workspace has changed: one file in the last turn, and one more over the thread.
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

// The pretend workspace's folders and the text of its files.
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
// With FAKE_AVEN_FILES (`setup`, `ship`, or both) the pretend repository has what /setup-env and
// /setup-ship write, which Ship waits for (decision 0083).
const AVEN_FILES = (process.env.FAKE_AVEN_FILES ?? "").split(",");
if (AVEN_FILES.includes("setup")) WORKSPACE_FILES[".aven/setup"] = "#!/bin/sh\nbun install\n";
if (AVEN_FILES.includes("ship")) {
  WORKSPACE_FILES[".aven/ship.md"] = "Commit, push, then open it with gh pr create --draft.\n";
}

// With FAKE_PROCESSES the pretend sandbox has a server running and a test that failed (decision
// 0071); stopping the server ends it. Without it, nothing runs in the background.
type PretendProcess = {
  id: string;
  command: string;
  status: "running" | "exited" | "stopped";
  exitCode?: number;
  startedAt: string;
  endedAt?: string;
};
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const PROCESSES: PretendProcess[] =
  process.env.FAKE_PROCESSES === "1"
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

let held: { holder: string; expiresAt: string } | null = null;
function answer(call: Extract<ControlPlaneToRuntime, { type: "call" }>) {
  const params = call.params as { holder?: string; leaseMs?: number };
  const reply = (result: unknown) => send({ type: "reply", id: call.id, ok: true, result });
  if (call.method === "run.steer") {
    // The person spoke while the run goes on (decision 0098). With FAKE_STEER_REFUSES the runner says
    // why it cannot take it; otherwise it takes it and the agent reads it a moment later, as it
    // would at the end of its tool, which FAKE_STEER_APPLIES_AFTER (milliseconds) sets.
    const { runId, steerId, prompt } = call.params as {
      runId: string;
      steerId: string;
      prompt: string;
    };
    event({ type: "steer", prompt });
    if (process.env.FAKE_STEER_REFUSES) {
      return reply({ status: "refused", reason: process.env.FAKE_STEER_REFUSES });
    }
    setTimeout(
      () =>
        send({
          type: "run.event",
          runId,
          seq: numbered(runId),
          event: { type: "steer_applied", id: steerId },
        }),
      Number(process.env.FAKE_STEER_APPLIES_AFTER ?? 400),
    );
    return reply({ status: "queued" });
  }
  if (call.method === "diff.get") {
    const { scope } = call.params as { scope: "turn" | "all" };
    return reply({
      patch: scope === "turn" ? TURN_PATCH : TURN_PATCH + ALL_ONLY_PATCH,
      truncated: false,
    });
  }
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
  if (call.method === "desktop.wake") sandboxRunning = true;
  if (!sandboxRunning) return reply(null);
  if (call.method === "desktop.takeover") {
    held = {
      holder: params.holder!,
      expiresAt: new Date(Date.now() + params.leaseMs!).toISOString(),
    };
    event({ type: "takeover", holder: held.holder });
    return reply({ held: true, ...held });
  }
  if (call.method === "desktop.release") {
    held = null;
    event({ type: "release", holder: params.holder });
    return reply({ held: false });
  }
  reply({
    state: "running",
    width: WIDTH,
    height: HEIGHT,
    control: held ? { held: true, ...held } : { held: false },
  });
}

console.log("READY");
