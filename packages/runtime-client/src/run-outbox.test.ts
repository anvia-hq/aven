import { describe, expect, test } from "bun:test";
import type { RuntimeToControlPlane } from "@aven/protocol/runtime-wire";

import { RunOutbox } from "./run-outbox";

const event = (runId: string, seq: number, delta: string): RuntimeToControlPlane => ({
  type: "run.event",
  runId,
  seq,
  event: { type: "text", delta },
});

const say = (outbox: RunOutbox, runId: string, delta: string) =>
  outbox.push(runId, (seq) => event(runId, seq, delta));

describe("RunOutbox", () => {
  test("numbers a run's messages from 1", () => {
    const outbox = new RunOutbox();
    outbox.open("a");
    expect(say(outbox, "a", "x")).toEqual(event("a", 1, "x"));
    expect(say(outbox, "a", "y")).toEqual(event("a", 2, "y"));
    outbox.open("b");
    expect(say(outbox, "b", "z")).toEqual(event("b", 1, "z"));
  });

  test("after a reconnect a run is replayed from where the control plane stopped, then goes live", () => {
    const outbox = new RunOutbox();
    outbox.open("a");
    for (const delta of ["1", "2", "3", "4"]) say(outbox, "a", delta);

    outbox.detachAll();
    expect(outbox.attached("a")).toBe(false);
    // Still kept while nobody is listening.
    say(outbox, "a", "5");

    expect(outbox.attach("a", 2)).toEqual([
      event("a", 3, "3"),
      event("a", 4, "4"),
      event("a", 5, "5"),
    ]);
    expect(outbox.attached("a")).toBe(true);
  });

  test("an acknowledged run is forgotten", () => {
    const outbox = new RunOutbox();
    outbox.open("a");
    say(outbox, "a", "x");
    expect(outbox.ids()).toEqual(["a"]);
    outbox.ack("a");
    expect(outbox.ids()).toEqual([]);
    expect(say(outbox, "a", "late")).toBeNull();
    expect(outbox.attach("a", 0)).toEqual([]);
  });
});
