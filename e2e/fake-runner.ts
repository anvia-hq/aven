// A runner for e2e whose desktop is pretend: it speaks the runtime wire and, for a viewer, a small
// RFB (VNC) server that shows one red screen and reports the keys and clicks it receives. No
// Docker. What it learns is printed as `EVENT {json}` lines for the spec to read.
import { WIRE_VERSION, type ControlPlaneToRuntime } from "../packages/protocol/src/runtime-wire";
import { decodeViewerFrame, encodeViewerFrame } from "../packages/protocol/src/viewer-frame";

const base = process.env.AVEN_URL!;
const token = process.env.AVEN_RUNTIME_TOKEN!;
// With NO_SANDBOX the thread has no running container, as before its first run; waking it starts one.
let sandboxRunning = process.env.NO_SANDBOX !== "1";
const WIDTH = 640;
const HEIGHT = 400;

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

// What a viewer sends, one message at a time, in the order the RFB protocol defines.
class FakeDesktop {
  #buffer = new Uint8Array(0);
  #stage: "version" | "security" | "init" | "messages" = "version";
  // Where the red channel sits in a pixel; the viewer changes it with SetPixelFormat.
  #redShift = 16;

  constructor(private reply: (bytes: Uint8Array) => void) {
    reply(text("RFB 003.008\n"));
  }

  feed(bytes: Uint8Array) {
    const joined = new Uint8Array(this.#buffer.length + bytes.length);
    joined.set(this.#buffer);
    joined.set(bytes, this.#buffer.length);
    this.#buffer = joined;
    while (this.#step());
  }

  // Handles one message if all of it has arrived.
  #step() {
    const view = new DataView(this.#buffer.buffer, this.#buffer.byteOffset, this.#buffer.length);
    const take = (length: number) => {
      this.#buffer = this.#buffer.slice(length);
      return true;
    };
    if (this.#stage === "version") {
      if (this.#buffer.length < 12) return false;
      this.#stage = "security";
      this.reply(new Uint8Array([1, 1])); // one security type: none
      return take(12);
    }
    if (this.#stage === "security") {
      if (this.#buffer.length < 1) return false;
      this.#stage = "init";
      this.reply(new Uint8Array(4)); // security result: ok
      return take(1);
    }
    if (this.#stage === "init") {
      if (this.#buffer.length < 1) return false;
      this.#stage = "messages";
      this.reply(this.#serverInit());
      return take(1);
    }
    if (this.#buffer.length < 1) return false;
    switch (view.getUint8(0)) {
      case 0: // SetPixelFormat
        if (this.#buffer.length < 20) return false;
        this.#redShift = view.getUint8(14);
        return take(20);
      case 2: {
        // SetEncodings
        if (this.#buffer.length < 4) return false;
        const length = 4 + 4 * view.getUint16(2);
        return this.#buffer.length >= length && take(length);
      }
      case 3: // FramebufferUpdateRequest
        if (this.#buffer.length < 10) return false;
        if (view.getUint8(1) === 0) this.reply(this.#screen());
        return take(10);
      case 4: // KeyEvent
        if (this.#buffer.length < 8) return false;
        event({ type: "key", down: view.getUint8(1) === 1, keysym: view.getUint32(4) });
        return take(8);
      case 5: // PointerEvent
        if (this.#buffer.length < 6) return false;
        event({
          type: "pointer",
          buttons: view.getUint8(1),
          x: view.getUint16(2),
          y: view.getUint16(4),
        });
        return take(6);
      case 6: {
        // ClientCutText
        if (this.#buffer.length < 8) return false;
        const length = 8 + view.getUint32(4);
        return this.#buffer.length >= length && take(length);
      }
      default:
        throw new Error(`Unexpected RFB message ${view.getUint8(0)}`);
    }
  }

  #serverInit() {
    const name = text("e2e desktop");
    const init = new Uint8Array(24 + name.length);
    const view = new DataView(init.buffer);
    view.setUint16(0, WIDTH);
    view.setUint16(2, HEIGHT);
    // 32 bits per pixel, 24 deep, little-endian, true colour, 8 bits each, red at 16, green at 8.
    init.set([32, 24, 0, 1], 4);
    view.setUint16(8, 255);
    view.setUint16(10, 255);
    view.setUint16(12, 255);
    init.set([16, 8, 0], 14);
    view.setUint32(20, name.length);
    init.set(name, 24);
    return init;
  }

  // One raw rectangle covering the screen, all red.
  #screen() {
    const header = new Uint8Array(16);
    const view = new DataView(header.buffer);
    view.setUint16(2, 1); // one rectangle
    view.setUint16(8, WIDTH);
    view.setUint16(10, HEIGHT);
    const message = new Uint8Array(16 + WIDTH * HEIGHT * 4);
    message.set(header);
    // The viewer asked for little-endian 32-bit pixels with red at `#redShift`.
    for (let at = 16; at < message.length; at += 4) {
      new DataView(message.buffer).setUint32(at, 255 << this.#redShift, true);
    }
    return message;
  }
}

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

ws.onopen = () => send({ type: "hello", version: WIRE_VERSION, runs: [] });
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
      send({ type: "desktop.closed", viewerId, reason: "The thread's sandbox is not running" });
      return;
    }
    send({ type: "desktop.opened", viewerId });
    viewers.set(viewerId, new FakeDesktop((bytes) => ws.send(encodeViewerFrame(viewerId, bytes))));
  } else if (message.type === "desktop.close") {
    viewers.delete(message.viewerId);
  } else if (message.type === "terminal.open") {
    const { viewerId, cols, rows } = message;
    if (!sandboxRunning) {
      send({ type: "terminal.closed", viewerId, reason: "The thread's sandbox is not running" });
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
    event({ type: "started", prompt: message.prompt, mentions: message.mentions });
    if (process.env.FAKE_RUN_ENDS) {
      const { runId } = message;
      send({
        type: "run.event",
        runId,
        seq: numbered(runId),
        event: { type: "text", delta: "Done." },
      });
      send({ type: "run.end", runId, seq: numbered(runId), outcome: "response" });
    }
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

let held: { holder: string; expiresAt: string } | null = null;
function answer(call: Extract<ControlPlaneToRuntime, { type: "call" }>) {
  const params = call.params as { holder?: string; leaseMs?: number };
  const reply = (result: unknown) => send({ type: "reply", id: call.id, ok: true, result });
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
