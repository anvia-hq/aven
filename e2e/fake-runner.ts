// A runner for e2e whose desktop is pretend: it speaks the runtime wire and, for a viewer, a small
// RFB (VNC) server that shows one red screen and reports the keys and clicks it receives. No
// Docker. What it learns is printed as `EVENT {json}` lines for the spec to read.
import {
  WIRE_VERSION,
  decodeViewerFrame,
  encodeViewerFrame,
  type ControlPlaneToRuntime,
} from "../packages/protocol/src/runtime-wire";

const base = process.env.AVEN_URL!;
const token = process.env.AVEN_RUNTIME_TOKEN!;
// With NO_SANDBOX the thread has no running container, as before its first run.
const sandboxRunning = process.env.NO_SANDBOX !== "1";
const WIDTH = 640;
const HEIGHT = 400;

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

const send = (message: object) => ws.send(JSON.stringify(message));

ws.onopen = () => send({ type: "hello", version: WIRE_VERSION });
ws.onmessage = ({ data }) => {
  if (data instanceof ArrayBuffer) {
    const frame = decodeViewerFrame(new Uint8Array(data));
    if (frame) viewers.get(frame.viewerId)?.feed(frame.payload);
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
  } else if (message.type === "call") {
    answer(message);
  }
};

let held: { holder: string; expiresAt: string } | null = null;
function answer(call: Extract<ControlPlaneToRuntime, { type: "call" }>) {
  const params = call.params as { holder?: string; leaseMs?: number };
  const reply = (result: unknown) => send({ type: "reply", id: call.id, ok: true, result });
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
