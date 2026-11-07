import { describe, expect, test } from "bun:test";
import type { SandboxDesktop } from "@anvia/sandbox";
import { decodeViewerFrame } from "@aven/protocol/viewer-frame";

import { DesktopViewers } from "./desktop-viewers";
import { fakeDesktop } from "./testing/fake-desktop";
import type { RuntimeToControlPlane } from "@aven/protocol/types";
import type { ThreadWorkspaces } from "./types";

const viewerId = crypto.randomUUID();

function setup(desktop: SandboxDesktop | undefined) {
  const sent: RuntimeToControlPlane[] = [];
  const frames: Uint8Array[] = [];
  const link = { buffered: 0 };
  const sandbox = { desktop: () => desktop } as unknown as ThreadWorkspaces;
  const viewers = new DesktopViewers(sandbox, {
    send: (message) => void sent.push(message),
    sendBinary: (frame) => void frames.push(frame),
    buffered: () => link.buffered,
  });
  return { viewers, sent, frames, link };
}

const until = async (condition: () => boolean) => {
  for (let i = 0; i < 100 && !condition(); i++) await Bun.sleep(10);
  expect(condition()).toBe(true);
};

describe("DesktopViewers", () => {
  test("a thread whose sandbox is not running has nothing to view", async () => {
    const { viewers, sent } = setup(undefined);
    await viewers.open(viewerId, "t1");
    expect(sent).toEqual([
      { type: "desktop.closed", viewerId, reason: "The sandbox is not running" },
    ]);
    expect(viewers.watching("t1")).toBe(0);
  });

  test("streams the desktop as frames for the viewer, and the browser's bytes go back", async () => {
    const fake = fakeDesktop();
    const { viewers, sent, frames } = setup(fake.desktop);
    await viewers.open(viewerId, "t1");
    expect(sent).toEqual([{ type: "desktop.opened", viewerId }]);

    await fake.push(new Uint8Array([82, 70, 66]));
    await until(() => frames.length === 1);
    expect(decodeViewerFrame(frames[0]!)).toEqual({
      viewerId,
      payload: new Uint8Array([82, 70, 66]),
    });

    viewers.write(viewerId, new Uint8Array([9]));
    await until(() => fake.record.written.length === 1);
    expect(fake.record.written[0]).toEqual(new Uint8Array([9]));
  });

  test("closing a viewer stops it without telling the control plane it ended", async () => {
    const fake = fakeDesktop();
    const { viewers, sent } = setup(fake.desktop);
    await viewers.open(viewerId, "t1");
    expect(viewers.watching("t1")).toBe(1);

    viewers.close(viewerId);

    expect(fake.record.closed).toBe(true);
    expect(viewers.watching("t1")).toBe(0);
    await Bun.sleep(30);
    expect(sent.map((message) => message.type)).toEqual(["desktop.opened"]);
  });

  test("a desktop that ends its stream tells the control plane why", async () => {
    const fake = fakeDesktop();
    const { viewers, sent } = setup(fake.desktop);
    await viewers.open(viewerId, "t1");

    await fake.end();

    await until(() => sent.some((message) => message.type === "desktop.closed"));
    expect(sent.at(-1)).toEqual({
      type: "desktop.closed",
      viewerId,
      reason: "The desktop connection ended",
    });
    expect(viewers.watching("t1")).toBe(0);
  });

  test("a viewer closed while the desktop is still opening is closed once it opens", async () => {
    const fake = fakeDesktop();
    const gate = Promise.withResolvers<void>();
    const slow = {
      openViewer: async () => (await gate.promise, fake.desktop.openViewer()),
    } as unknown as SandboxDesktop;
    const { viewers, sent } = setup(slow);

    const opening = viewers.open(viewerId, "t1");
    viewers.close(viewerId);
    gate.resolve();
    await opening;

    expect(fake.record.closed).toBe(true);
    expect(sent).toEqual([]);
  });

  test("stops reading the desktop while the link is backed up", async () => {
    const fake = fakeDesktop();
    const { viewers, frames, link } = setup(fake.desktop);
    await viewers.open(viewerId, "t1");
    link.buffered = 10 * 1024 * 1024;

    await fake.push(new Uint8Array([1]));
    await Bun.sleep(60);
    expect(frames).toHaveLength(0);

    link.buffered = 0;
    await until(() => frames.length === 1);
  });

  test("status is null without a sandbox, else the desktop's state and control", async () => {
    expect(await setup(undefined).viewers.call("desktop.status", { threadId: "t1" })).toBeNull();
    const { viewers } = setup(fakeDesktop().desktop);
    expect(await viewers.call("desktop.status", { threadId: "t1" })).toEqual({
      state: "running",
      width: 1280,
      height: 800,
      control: { held: false },
    });
  });

  test("takeover and release go to the desktop with who and for how long", async () => {
    const fake = fakeDesktop();
    const { viewers } = setup(fake.desktop);

    const held = await viewers.call("desktop.takeover", {
      threadId: "t1",
      holder: "me",
      leaseMs: 60_000,
    });
    const freed = await viewers.call("desktop.release", { threadId: "t1", holder: "me" });

    expect(held).toEqual({ held: true, holder: "me" });
    expect(freed).toEqual({ held: false });
    expect(fake.record.takeovers).toEqual([
      { holder: "me", leaseMs: 60_000 },
      { holder: "me", force: false },
    ]);
  });

  test("a takeover without a holder, or a call without a thread, is refused", async () => {
    const { viewers } = setup(fakeDesktop().desktop);
    await expect(viewers.call("desktop.takeover", { threadId: "t1" })).rejects.toThrow("Invalid");
    await expect(viewers.call("desktop.status", {})).rejects.toThrow("Invalid");
    await expect(viewers.call("desktop.status", undefined)).rejects.toThrow("Invalid");
  });
});
