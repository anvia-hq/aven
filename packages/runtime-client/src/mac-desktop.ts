import { DockerSandboxError } from "@anvia/sandbox";
import type {
  DesktopAction,
  DesktopControl,
  DesktopScreenshot,
  DesktopStatus,
  SandboxDesktop,
  TunnelHandle,
} from "@anvia/sandbox/remote";

import { encodePng, scaleFrame } from "./png";
import { RfbClient } from "./rfb";
import { charKeysym, keyChord, needsShift } from "./rfb-keys";
import { openVncViewer } from "./rfb-viewer";
import type { MacDesktopOptions, VncEndpoint } from "./types";

const DEFAULT_LEASE_MS = 60_000;
const MAX_LEASE_MS = 60 * 60_000;
const DEFAULT_SIZE = { width: 1280, height: 800 };
const SHIFT = 0xffe1;
const BUTTONS = { left: 1, middle: 2, right: 4 } as const;
const WHEEL = { up: 8, down: 16, left: 32, right: 64 } as const;
const DEFAULT_SCROLL_CLICKS = 3;
const DEFAULT_KEY_DELAY_MS = 12;
const CLICK_GAP_MS = 40;
const DRAG_STEPS = 12;

const locked = (holder: string | undefined) =>
  new DockerSandboxError(`The desktop is controlled by ${holder}.`, "desktop_locked");

export class MacDesktop implements SandboxDesktop {
  #options: MacDesktopOptions;
  #client: RfbClient | undefined;
  #connecting: Promise<RfbClient> | undefined;
  #connectedTo: string | undefined;
  #holder: string | undefined;
  #expiresAt = 0;
  #timer: Timer | undefined;

  constructor(options: MacDesktopOptions) {
    this.#options = options;
  }

  async #rfb() {
    const endpoint = this.#options.endpoint();
    if (!endpoint) {
      throw new DockerSandboxError("The sandbox is not running", "sandbox_unavailable");
    }
    const key = `${endpoint.port}:${endpoint.password}`;
    if (this.#client?.open && this.#connectedTo === key) return this.#client;
    this.#client?.close();
    this.#client = undefined;
    this.#connecting ??= this.#connect(endpoint, key).finally(() => {
      this.#connecting = undefined;
    });
    return this.#connecting;
  }

  async #connect(endpoint: VncEndpoint, key: string) {
    const client = await RfbClient.connect(endpoint);
    this.#client = client;
    this.#connectedTo = key;
    return client;
  }

  #control(): DesktopControl {
    if (this.#holder === undefined) return { held: false };
    return { held: true, holder: this.#holder, expiresAt: new Date(this.#expiresAt).toISOString() };
  }

  #clear() {
    clearTimeout(this.#timer);
    this.#timer = undefined;
    this.#holder = undefined;
    this.#expiresAt = 0;
  }

  async status(): Promise<DesktopStatus> {
    const running = this.#options.endpoint() !== undefined;
    const size = running
      ? await this.#rfb().then(
          ({ width, height }) => ({ width, height }),
          () => DEFAULT_SIZE,
        )
      : DEFAULT_SIZE;
    return {
      state: running ? "running" : "stopped",
      ...size,
      maxWidth: size.width,
      maxHeight: size.height,
      display: "vnc",
      vncPort: this.#options.endpoint()?.port ?? 0,
      restarts: 0,
      control: this.#control(),
    };
  }

  async start() {
    await this.#options.start();
    return this.status();
  }

  async resize(): Promise<DesktopStatus> {
    throw new DockerSandboxError("A macOS desktop cannot be resized", "unsupported");
  }

  async screenshot(options: { scale?: number | undefined } = {}): Promise<DesktopScreenshot> {
    const client = await this.#rfb();
    const frame = await client.refresh();
    const scaled = scaleFrame(frame, options.scale ?? 1);
    return {
      png: encodePng(scaled),
      width: scaled.width,
      height: scaled.height,
      displayWidth: frame.width,
      displayHeight: frame.height,
    };
  }

  async cursorPosition() {
    const { pointer } = await this.#rfb();
    return { x: pointer.x, y: pointer.y };
  }

  control() {
    return Promise.resolve(this.#control());
  }

  async takeover({ holder, leaseMs }: { holder: string; leaseMs?: number }) {
    if (this.#holder !== undefined && this.#holder !== holder) throw locked(this.#holder);
    const lease = Math.min(leaseMs ?? DEFAULT_LEASE_MS, MAX_LEASE_MS);
    clearTimeout(this.#timer);
    this.#holder = holder;
    this.#expiresAt = Date.now() + lease;
    this.#timer = setTimeout(() => this.#clear(), lease);
    this.#timer.unref?.();
    return this.#control();
  }

  async release({ holder, force }: { holder?: string; force?: boolean } = {}) {
    if (this.#holder !== undefined && !force && holder !== undefined && holder !== this.#holder) {
      throw locked(this.#holder);
    }
    this.#clear();
    return this.#control();
  }

  async openViewer(): Promise<TunnelHandle> {
    const endpoint = this.#options.endpoint();
    if (!endpoint) {
      throw new DockerSandboxError("The sandbox is not running", "sandbox_unavailable");
    }
    return openVncViewer(endpoint);
  }

  async act(action: DesktopAction) {
    if (this.#holder !== undefined) {
      throw new DockerSandboxError(
        `The desktop is controlled by ${this.#holder}; agent input is paused until they release it.`,
        "desktop_locked",
        { holder: this.#holder },
      );
    }
    const client = await this.#rfb();
    if (action.type === "mouse_move") return client.move(action.x, action.y, 0);
    if (action.type === "click") return this.#click(client, action);
    if (action.type === "drag") return this.#drag(client, action);
    if (action.type === "scroll") return this.#scroll(client, action);
    if (action.type === "type") return this.#type(client, action);
    return this.#chord(client, action.keys);
  }

  async #click(client: RfbClient, action: Extract<DesktopAction, { type: "click" }>) {
    const x = action.x ?? client.pointer.x;
    const y = action.y ?? client.pointer.y;
    const button = BUTTONS[action.button ?? "left"];
    client.move(x, y, 0);
    for (let index = 0; index < (action.count ?? 1); index++) {
      client.move(x, y, button);
      await Bun.sleep(CLICK_GAP_MS);
      client.move(x, y, 0);
      await Bun.sleep(CLICK_GAP_MS);
    }
  }

  async #drag(client: RfbClient, action: Extract<DesktopAction, { type: "drag" }>) {
    const fromX = action.fromX ?? client.pointer.x;
    const fromY = action.fromY ?? client.pointer.y;
    const button = BUTTONS[action.button ?? "left"];
    client.move(fromX, fromY, 0);
    client.move(fromX, fromY, button);
    for (let step = 1; step <= DRAG_STEPS; step++) {
      const x = fromX + ((action.toX - fromX) * step) / DRAG_STEPS;
      const y = fromY + ((action.toY - fromY) * step) / DRAG_STEPS;
      client.move(x, y, button);
      await Bun.sleep(CLICK_GAP_MS / 2);
    }
    client.move(action.toX, action.toY, 0);
  }

  async #scroll(client: RfbClient, action: Extract<DesktopAction, { type: "scroll" }>) {
    const x = action.x ?? client.pointer.x;
    const y = action.y ?? client.pointer.y;
    client.move(x, y, 0);
    for (let click = 0; click < (action.amount ?? DEFAULT_SCROLL_CLICKS); click++) {
      client.move(x, y, WHEEL[action.direction]);
      client.move(x, y, 0);
      await Bun.sleep(CLICK_GAP_MS / 2);
    }
  }

  async #type(client: RfbClient, action: Extract<DesktopAction, { type: "type" }>) {
    for (const char of action.text) {
      const symbol = charKeysym(char);
      const shifted = needsShift(char);
      if (shifted) client.key(SHIFT, true);
      client.key(symbol, true);
      client.key(symbol, false);
      if (shifted) client.key(SHIFT, false);
      await Bun.sleep(action.delayMs ?? DEFAULT_KEY_DELAY_MS);
    }
  }

  async #chord(client: RfbClient, keys: string) {
    const { modifiers, key } = keyChord(keys);
    for (const modifier of modifiers) client.key(modifier, true);
    await Bun.sleep(CLICK_GAP_MS);
    client.key(key, true);
    client.key(key, false);
    await Bun.sleep(CLICK_GAP_MS);
    for (const modifier of modifiers.toReversed()) client.key(modifier, false);
  }

  dispose() {
    this.#clear();
    this.#client?.close();
    this.#client = undefined;
  }
}
