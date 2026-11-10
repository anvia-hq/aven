import { afterEach, describe, expect, test } from "bun:test";

import { MacDesktop } from "./mac-desktop";
import { startFakeVnc } from "./testing/fake-vnc";
import type { VncEndpoint } from "./types";

const closers: { close(): void }[] = [];
const desktops: MacDesktop[] = [];
afterEach(() => {
  for (const desktop of desktops.splice(0)) desktop.dispose();
  for (const closer of closers.splice(0)) closer.close();
});

function setup(options: { running?: boolean } = {}) {
  const fake = startFakeVnc({ width: 40, height: 30 });
  closers.push(fake);
  const endpoint: VncEndpoint = { host: "127.0.0.1", port: fake.port, password: fake.password };
  let started = 0;
  const desktop = new MacDesktop({
    endpoint: () => (options.running === false ? undefined : endpoint),
    start: async () => {
      started += 1;
    },
  });
  desktops.push(desktop);
  return { fake, desktop, started: () => started };
}

const sent = async (desktop: MacDesktop, fake: ReturnType<typeof startFakeVnc>) => {
  await desktop.screenshot();
  return fake.events;
};

describe("a macOS desktop", () => {
  test("says it is running with the screen's size, or stopped when the VM is not up", async () => {
    const { desktop } = setup();
    expect(await desktop.status()).toMatchObject({
      state: "running",
      width: 40,
      height: 30,
      maxWidth: 40,
      control: { held: false },
    });
    expect(await setup({ running: false }).desktop.status()).toMatchObject({ state: "stopped" });
  });

  test("starting it starts the sandbox and reports the screen", async () => {
    const { desktop, started } = setup();
    expect(await desktop.start()).toMatchObject({ state: "running", width: 40 });
    expect(started()).toBe(1);
  });

  test("a screenshot is a PNG, smaller when asked, and says how big the display is", async () => {
    const { desktop } = setup();
    const full = await desktop.screenshot();
    expect(Buffer.from(full.png.subarray(0, 4)).toString("hex")).toBe("89504e47");
    expect([full.width, full.height, full.displayWidth, full.displayHeight]).toEqual([
      40, 30, 40, 30,
    ]);
    const half = await desktop.screenshot({ scale: 0.5 });
    expect([half.width, half.height, half.displayWidth, half.displayHeight]).toEqual([
      20, 15, 40, 30,
    ]);
  });

  test("clicks with the button asked for, as often as asked, and remembers where the pointer is", async () => {
    const { desktop, fake } = setup();
    await desktop.act({ type: "click", x: 5, y: 6, button: "right", count: 2 });
    expect(
      (await sent(desktop, fake)).map((event) => event.type === "pointer" && event.buttons),
    ).toEqual([0, 4, 0, 4, 0]);
    expect(await desktop.cursorPosition()).toEqual({ x: 5, y: 6 });
    await desktop.act({ type: "click" });
    expect(fake.events.at(-1)).toMatchObject({ type: "pointer", x: 5, y: 6, buttons: 0 });
  });

  test("types with Shift for capitals and symbols, and presses chords with command as the remapped key", async () => {
    const { desktop, fake } = setup();
    await desktop.act({ type: "type", text: "A&b", delayMs: 0 });
    const keys = (await sent(desktop, fake)).map((event) =>
      event.type === "key" ? `${event.down ? "+" : "-"}${event.keysym.toString(16)}` : "",
    );
    expect(keys).toEqual([
      "+ffe1",
      "+41",
      "-41",
      "-ffe1",
      "+ffe1",
      "+26",
      "-26",
      "-ffe1",
      "+62",
      "-62",
    ]);

    fake.events.length = 0;
    await desktop.act({ type: "key", keys: "cmd+k" });
    expect(
      (await sent(desktop, fake)).map((event) =>
        event.type === "key" ? `${event.down ? "+" : "-"}${event.keysym.toString(16)}` : "",
      ),
    ).toEqual(["+ffea", "+6b", "-6b", "-ffea"]);
  });

  test("scrolls with the wheel buttons, drags to where it is told and lets go there", async () => {
    const { desktop, fake } = setup();
    await desktop.act({ type: "scroll", direction: "down", amount: 2, x: 3, y: 4 });
    expect(
      (await sent(desktop, fake)).filter(
        (event) => event.type === "pointer" && event.buttons === 16,
      ),
    ).toHaveLength(2);

    fake.events.length = 0;
    await desktop.act({ type: "drag", fromX: 1, fromY: 1, toX: 20, toY: 10 });
    const events = await sent(desktop, fake);
    expect(events.at(-1)).toEqual({ type: "pointer", buttons: 0, x: 20, y: 10 });
    expect(
      events.filter((event) => event.type === "pointer" && event.buttons === 1).length,
    ).toBeGreaterThan(2);
  });

  test("a person who takes control pauses the agent, nobody else can take it, and release gives it back", async () => {
    const { desktop, fake } = setup();
    expect((await desktop.takeover({ holder: "ana", leaseMs: 60_000 })).holder).toBe("ana");
    await expect(desktop.act({ type: "type", text: "x" })).rejects.toThrow("agent input is paused");
    await expect(desktop.takeover({ holder: "bo" })).rejects.toThrow("controlled by ana");
    await expect(desktop.release({ holder: "bo" })).rejects.toThrow("controlled by ana");
    expect((await desktop.status()).control).toMatchObject({ held: true, holder: "ana" });

    expect(await desktop.release({ holder: "ana" })).toEqual({ held: false });
    await desktop.act({ type: "type", text: "x", delayMs: 0 });
    expect((await sent(desktop, fake)).length).toBe(2);
    await desktop.takeover({ holder: "ana" });
    expect(await desktop.release({ holder: "bo", force: true })).toEqual({ held: false });
  });

  test("a lease runs out by itself", async () => {
    const { desktop } = setup();
    await desktop.takeover({ holder: "ana", leaseMs: 30 });
    await Bun.sleep(80);
    expect(await desktop.control()).toEqual({ held: false });
  });

  test("cannot be resized, and has nothing to act on or show while the VM is down", async () => {
    await expect(setup().desktop.resize()).rejects.toThrow("cannot be resized");
    const down = setup({ running: false }).desktop;
    await expect(down.act({ type: "mouse_move", x: 1, y: 1 })).rejects.toThrow("not running");
    await expect(down.openViewer()).rejects.toThrow("not running");
  });

  test("opens the relay for a browser while the VM is up", async () => {
    const { desktop } = setup();
    const viewer = await desktop.openViewer();
    const first = await viewer.output[Symbol.asyncIterator]().next();
    expect(Buffer.from(first.value as Uint8Array).toString()).toBe("RFB 003.008\n");
    viewer.close();
  });
});
