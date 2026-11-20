import { describe, expect, test } from "bun:test";

import { createControlPlaneCalls } from "./control-plane-calls";
import type { RuntimeToControlPlane } from "@aven/protocol/types";

describe("calls to the control plane", () => {
  test("after a reconnect, a call is sent again, but one to a machine fails rather than act twice", async () => {
    const sent: RuntimeToControlPlane[] = [];
    const { call, resend } = createControlPlaneCalls({
      send: (message) => (sent.push(message), true),
      timeoutMs: 1000,
    });

    const notes = call("memory.notes", {
      runId: "r1",
      command: { command: "view", path: "/memories" },
    });
    const exec = call("machine.call", {
      runId: "r1",
      op: "exec",
      args: { command: "rm -rf build" },
    });
    resend();

    await expect(exec).rejects.toThrow("not sent again");
    expect(sent.map((message) => message.type === "call" && message.method)).toEqual([
      "memory.notes",
      "machine.call",
      "memory.notes",
    ]);
    notes.catch(() => undefined);
  });
});
