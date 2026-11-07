import { describe, expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { type RuntimeToControlPlane } from "@aven/protocol/runtime-wire";
import { decodeViewerFrame } from "@aven/protocol/viewer-frame";

import type { ThreadWorkspaces } from "./sandbox";
import { TerminalSessions } from "./terminal-sessions";

const viewerId = crypto.randomUUID();
const size = { cols: 100, rows: 30 };

function setup(running = true) {
  const hangupFile = join(tmpdir(), `terminal-hangup-${crypto.randomUUID()}`);
  const sent: RuntimeToControlPlane[] = [];
  const frames: Uint8Array[] = [];
  const link = { buffered: 0 };
  const sandbox = {
    shell: () =>
      running
        ? {
            argv: ["sh"],
            env: { PATH: process.env.PATH ?? "", PS1: "$ " },
            hangup: ["sh", "-c", `echo hung >> ${hangupFile}`],
          }
        : undefined,
  } as unknown as ThreadWorkspaces;
  const sessions = new TerminalSessions(sandbox, {
    send: (message) => void sent.push(message),
    sendBinary: (frame) => void frames.push(frame),
    buffered: () => link.buffered,
  });
  const output = () =>
    frames.map((frame) => new TextDecoder().decode(decodeViewerFrame(frame)?.payload)).join("");
  const hangups = async () =>
    (
      await Bun.file(hangupFile)
        .text()
        .catch(() => "")
    )
      .split("\n")
      .filter(Boolean).length;
  return { sessions, sent, frames, link, output, hangups };
}

const until = async (condition: () => boolean) => {
  for (let i = 0; i < 200 && !condition(); i++) await Bun.sleep(10);
  expect(condition()).toBe(true);
};

const type = (text: string) => new TextEncoder().encode(text);

describe("TerminalSessions", () => {
  test("a thread whose sandbox is not running has no shell", () => {
    const { sessions, sent } = setup(false);
    sessions.open(viewerId, "t1", size);
    expect(sent).toEqual([
      { type: "terminal.closed", viewerId, reason: "The sandbox is not running" },
    ]);
    expect(sessions.count("t1")).toBe(0);
  });

  test("keystrokes reach a shell on a terminal of the asked size, and its output comes back", async () => {
    const { sessions, sent, output } = setup();
    sessions.open(viewerId, "t1", size);
    expect(sent).toEqual([{ type: "terminal.opened", viewerId }]);
    expect(sessions.count("t1")).toBe(1);

    sessions.write(viewerId, type("stty size\n"));
    await until(() => output().includes("30 100"));

    sessions.resize(viewerId, 80, 24);
    sessions.write(viewerId, type("stty size\n"));
    await until(() => output().includes("24 80"));
    sessions.close(viewerId);
  });

  test("a shell that exits ends the terminal", async () => {
    const { sessions, sent } = setup();
    sessions.open(viewerId, "t1", size);
    sessions.write(viewerId, type("exit\n"));
    await until(() => sent.some((message) => message.type === "terminal.closed"));
    expect(sent.at(-1)).toEqual({ type: "terminal.closed", viewerId, reason: "The shell ended" });
    expect(sessions.has(viewerId)).toBe(false);
  });

  test("closing stops the shell without reporting it", async () => {
    const { sessions, sent, hangups } = setup();
    sessions.open(viewerId, "t1", size);
    sessions.close(viewerId);
    await Bun.sleep(100);
    expect(sent).toEqual([{ type: "terminal.opened", viewerId }]);
    expect(await hangups()).toBe(1);
    expect(sessions.count("t1")).toBe(0);
  });

  test("output that a slow link cannot carry ends the terminal", async () => {
    const { sessions, sent, link } = setup();
    sessions.open(viewerId, "t1", size);
    link.buffered = 64 * 1024 * 1024;
    sessions.write(viewerId, type("echo hi\n"));
    await until(() => sent.some((message) => message.type === "terminal.closed"));
    expect(sessions.has(viewerId)).toBe(false);
  });
});
