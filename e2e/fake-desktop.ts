// A pretend desktop for e2e: a small RFB (VNC) server that shows one red screen and reports the keys
// and clicks it receives. It is what a viewer's bytes are fed to, and what it answers goes to `reply`.
export const WIDTH = 640;
export const HEIGHT = 400;

const text = (value: string) => new TextEncoder().encode(value);

// What a viewer sends, one message at a time, in the order the RFB protocol defines.
export class FakeDesktop {
  #buffer = new Uint8Array(0);
  #stage: "version" | "security" | "init" | "messages" = "version";
  // Where the red channel sits in a pixel; the viewer changes it with SetPixelFormat.
  #redShift = 16;

  constructor(
    private reply: (bytes: Uint8Array) => void,
    private event: (value: object) => void,
  ) {
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
        this.event({ type: "key", down: view.getUint8(1) === 1, keysym: view.getUint32(4) });
        return take(8);
      case 5: // PointerEvent
        if (this.#buffer.length < 6) return false;
        this.event({
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
