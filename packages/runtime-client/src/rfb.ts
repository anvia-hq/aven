import { createCipheriv } from "node:crypto";

import { ByteQueue } from "./byte-queue";
import type { PointerState, RfbFrame, VncEndpoint } from "./types";

const RAW = 0;
const COPY_RECT = 1;
const CURSOR = -239;
const DESKTOP_NAME = -307;
const DESKTOP_SIZE = -223;
const EXTENDED_DESKTOP_SIZE = -308;
const ENCODINGS = [RAW, COPY_RECT, DESKTOP_SIZE, EXTENDED_DESKTOP_SIZE, CURSOR, DESKTOP_NAME];
const SECURITY_NONE = 1;
const SECURITY_VNC = 2;
const REFRESH_TIMEOUT_MS = 15_000;
const MAX_REFRESHES = 4;

const reverseBits = (byte: number) => {
  let reversed = 0;
  for (let bit = 0; bit < 8; bit++) reversed |= ((byte >> bit) & 1) << (7 - bit);
  return reversed;
};

export function vncResponse(password: string, challenge: Uint8Array) {
  const key = Buffer.alloc(8);
  Buffer.from(password.slice(0, 8)).forEach((byte, index) => {
    key[index] = reverseBits(byte);
  });
  const cipher = createCipheriv("des-ecb", key, null);
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(challenge), cipher.final()]);
}

type Socket = Awaited<ReturnType<typeof Bun.connect>>;

export class RfbLink {
  readonly queue = new ByteQueue();
  #socket: Socket | undefined;
  #pending: Uint8Array[] = [];

  static async open({ host, port }: Pick<VncEndpoint, "host" | "port">) {
    const link = new RfbLink();
    link.#socket = await Bun.connect({
      hostname: host,
      port,
      socket: {
        data: (_socket, data) => link.queue.push(new Uint8Array(data)),
        drain: () => link.#flush(),
        close: () => link.queue.end(),
        error: (_socket, error) => link.queue.end(error),
        connectError: (_socket, error) => link.queue.end(error),
      },
    });
    return link;
  }

  write(data: Uint8Array) {
    this.#pending.push(data);
    this.#flush();
  }

  #flush() {
    while (this.#pending.length > 0 && this.#socket) {
      const head = this.#pending[0]!;
      const written = this.#socket.write(head);
      if (written < head.length) {
        this.#pending[0] = head.subarray(Math.max(written, 0));
        return;
      }
      this.#pending.shift();
    }
  }

  close() {
    this.#socket?.end();
  }
}

export async function rfbLogin(link: RfbLink, password: string) {
  const { queue } = link;
  const version = (await queue.take(12)).toString("latin1");
  if (!version.startsWith("RFB 003.")) throw new Error("The desktop did not speak RFB");
  link.write(Buffer.from("RFB 003.008\n"));
  const count = (await queue.take(1))[0]!;
  if (count === 0) {
    const reason = await queue.take((await queue.take(4)).readUInt32BE(0));
    throw new Error(`The desktop refused the connection: ${reason.toString()}`);
  }
  const types = [...(await queue.take(count))];
  if (types.includes(SECURITY_VNC)) {
    link.write(Buffer.from([SECURITY_VNC]));
    link.write(vncResponse(password, await queue.take(16)));
  } else if (types.includes(SECURITY_NONE)) {
    link.write(Buffer.from([SECURITY_NONE]));
  } else {
    throw new Error(`The desktop asks for a login this runner does not support (${types})`);
  }
  if ((await queue.take(4)).readUInt32BE(0) !== 0) {
    throw new Error("The desktop refused the password");
  }
}

function setPixelFormat() {
  const message = Buffer.alloc(20);
  message[0] = 0;
  message[4] = 32;
  message[5] = 24;
  message[6] = 0;
  message[7] = 1;
  message.writeUInt16BE(255, 8);
  message.writeUInt16BE(255, 10);
  message.writeUInt16BE(255, 12);
  message[14] = 0;
  message[15] = 8;
  message[16] = 16;
  return message;
}

function setEncodings() {
  const message = Buffer.alloc(4 + 4 * ENCODINGS.length);
  message[0] = 2;
  message.writeUInt16BE(ENCODINGS.length, 2);
  ENCODINGS.forEach((encoding, index) => message.writeInt32BE(encoding, 4 + 4 * index));
  return message;
}

function updateRequest(incremental: boolean, width: number, height: number) {
  const message = Buffer.alloc(10);
  message[0] = 3;
  message[1] = incremental ? 1 : 0;
  message.writeUInt16BE(width, 6);
  message.writeUInt16BE(height, 8);
  return message;
}

export class RfbClient {
  width: number;
  height: number;
  name: string;
  pointer: PointerState = { x: 0, y: 0, buttons: 0 };
  #link: RfbLink;
  #rgba: Uint8Array;
  #updates = 0;
  #resized = false;
  #waiters: (() => void)[] = [];
  #failed: Error | undefined;

  private constructor(link: RfbLink, width: number, height: number, name: string) {
    this.#link = link;
    this.width = width;
    this.height = height;
    this.name = name;
    this.#rgba = new Uint8Array(width * height * 4);
  }

  static async connect(endpoint: VncEndpoint) {
    const link = await RfbLink.open(endpoint);
    try {
      await rfbLogin(link, endpoint.password);
      link.write(Buffer.from([1]));
      const init = await link.queue.take(24);
      const name = (await link.queue.take(init.readUInt32BE(20))).toString();
      const client = new RfbClient(link, init.readUInt16BE(0), init.readUInt16BE(2), name);
      link.write(setPixelFormat());
      link.write(setEncodings());
      void client.#listen();
      return client;
    } catch (error) {
      link.close();
      throw error;
    }
  }

  get frame(): RfbFrame {
    return { width: this.width, height: this.height, rgba: this.#rgba };
  }

  get open() {
    return this.#failed === undefined;
  }

  async #listen() {
    try {
      for (;;) await this.#message();
    } catch (error) {
      this.#failed = error instanceof Error ? error : new Error(String(error));
      for (const waiter of this.#waiters.splice(0)) waiter();
    }
  }

  async #message() {
    const queue = this.#link.queue;
    const type = (await queue.take(1))[0]!;
    if (type === 0) return this.#update();
    if (type === 1) {
      const head = await queue.take(5);
      await queue.take(head.readUInt16BE(3) * 6);
      return;
    }
    if (type === 2) return;
    if (type === 3) {
      const head = await queue.take(7);
      await queue.take(head.readUInt32BE(3));
      return;
    }
    throw new Error(`The desktop sent a message this runner does not know (${type})`);
  }

  async #update() {
    const queue = this.#link.queue;
    const rects = (await queue.take(3)).readUInt16BE(1);
    for (let index = 0; index < rects; index++) {
      const head = await queue.take(12);
      const x = head.readUInt16BE(0);
      const y = head.readUInt16BE(2);
      const width = head.readUInt16BE(4);
      const height = head.readUInt16BE(6);
      const encoding = head.readInt32BE(8);
      if (encoding === RAW) this.#raw(x, y, width, height, await queue.take(width * height * 4));
      else if (encoding === COPY_RECT) this.#copy(x, y, width, height, await queue.take(4));
      else if (encoding === DESKTOP_SIZE) this.#resize(width, height);
      else if (encoding === EXTENDED_DESKTOP_SIZE) {
        const screens = (await queue.take(4))[0]!;
        await queue.take(screens * 16);
        if (y === 0) this.#resize(width, height);
      } else if (encoding === CURSOR)
        await queue.take(width * height * 4 + ((width + 7) >> 3) * height);
      else if (encoding === DESKTOP_NAME) {
        this.name = (await queue.take((await queue.take(4)).readUInt32BE(0))).toString();
      } else
        throw new Error(`The desktop sent an encoding this runner does not know (${encoding})`);
    }
    this.#updates += 1;
    for (const waiter of this.#waiters.splice(0)) waiter();
  }

  #resize(width: number, height: number) {
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    this.#rgba = new Uint8Array(width * height * 4);
    this.#resized = true;
  }

  #raw(x: number, y: number, width: number, height: number, pixels: Buffer) {
    for (let row = 0; row < height; row++) {
      if (y + row >= this.height) break;
      const length = Math.max(0, Math.min(width, this.width - x)) * 4;
      const from = row * width * 4;
      const to = ((y + row) * this.width + x) * 4;
      this.#rgba.set(pixels.subarray(from, from + length), to);
      for (let at = to + 3; at < to + length; at += 4) this.#rgba[at] = 255;
    }
  }

  #copy(x: number, y: number, width: number, height: number, source: Buffer) {
    const fromX = source.readUInt16BE(0);
    const fromY = source.readUInt16BE(2);
    const copy = this.#rgba.slice();
    for (let row = 0; row < height; row++) {
      const from = ((fromY + row) * this.width + fromX) * 4;
      const to = ((y + row) * this.width + x) * 4;
      this.#rgba.set(copy.subarray(from, from + width * 4), to);
    }
  }

  async refresh() {
    for (let attempt = 0; attempt < MAX_REFRESHES; attempt++) {
      this.#resized = false;
      const before = this.#updates;
      this.#link.write(updateRequest(false, this.width, this.height));
      await this.#until(() => this.#updates > before);
      if (!this.#resized) return this.frame;
    }
    return this.frame;
  }

  async #until(done: () => boolean) {
    const deadline = Date.now() + REFRESH_TIMEOUT_MS;
    while (!done()) {
      if (this.#failed) throw this.#failed;
      const left = deadline - Date.now();
      if (left <= 0) throw new Error("The desktop did not send a picture");
      await Promise.race([
        new Promise<void>((resolve) => this.#waiters.push(resolve)),
        Bun.sleep(left),
      ]);
    }
  }

  move(x: number, y: number, buttons = this.pointer.buttons) {
    this.pointer = { x, y, buttons };
    const message = Buffer.alloc(6);
    message[0] = 5;
    message[1] = buttons;
    message.writeUInt16BE(Math.max(0, Math.round(x)), 2);
    message.writeUInt16BE(Math.max(0, Math.round(y)), 4);
    this.#link.write(message);
  }

  key(keysym: number, down: boolean) {
    const message = Buffer.alloc(8);
    message[0] = 4;
    message[1] = down ? 1 : 0;
    message.writeUInt32BE(keysym >>> 0, 4);
    this.#link.write(message);
  }

  close() {
    this.#link.close();
  }
}
