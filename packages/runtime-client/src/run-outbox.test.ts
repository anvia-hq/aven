import { describe, expect, test } from "bun:test";

import { RunOutbox, openRunDatabase } from "./run-outbox";
import { journalPath } from "./testing/journal-path";
import type { RuntimeToControlPlane } from "@aven/protocol/types";

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
    const outbox = new RunOutbox(openRunDatabase(":memory:"));
    outbox.open("a");
    expect(say(outbox, "a", "x")).toEqual(event("a", 1, "x"));
    expect(say(outbox, "a", "y")).toEqual(event("a", 2, "y"));
    outbox.open("b");
    expect(say(outbox, "b", "z")).toEqual(event("b", 1, "z"));
  });

  test("after a reconnect a run is replayed from where the control plane stopped, then goes live", () => {
    const outbox = new RunOutbox(openRunDatabase(":memory:"));
    outbox.open("a");
    for (const delta of ["1", "2", "3", "4"]) say(outbox, "a", delta);

    outbox.detachAll();
    expect(outbox.attached("a")).toBe(false);
    say(outbox, "a", "5");

    expect(outbox.attach("a", 2)).toEqual([
      event("a", 3, "3"),
      event("a", 4, "4"),
      event("a", 5, "5"),
    ]);
    expect(outbox.attached("a")).toBe(true);
  });

  test("an acknowledged run is forgotten", () => {
    const outbox = new RunOutbox(openRunDatabase(":memory:"));
    outbox.open("a");
    say(outbox, "a", "x");
    expect(outbox.ids()).toEqual(["a"]);
    outbox.ack("a");
    expect(outbox.ids()).toEqual([]);
    expect(say(outbox, "a", "late")).toBeNull();
    expect(outbox.attach("a", 0)).toEqual([]);
  });

  test("what it kept survives the process, with its numbering and where each source had got to", () => {
    const path = journalPath();
    const before = new RunOutbox(openRunDatabase(path));
    before.open("a");
    before.push("a", (seq) => event("a", seq, "1"), { id: "journal-run", sequence: 7 });
    before.push("a", (seq) => event("a", seq, "2"), { id: "journal-run", sequence: 12 });
    before.push("a", (seq) => event("a", seq, "3"));

    const after = new RunOutbox(openRunDatabase(path));
    expect(after.ids()).toEqual(["a"]);
    expect(after.attached("a")).toBe(false);
    expect(after.cursor("a", "journal-run")).toBe(12);
    expect(after.cursor("a", "another")).toBe(0);
    expect(after.push("a", (seq) => event("a", seq, "4"))).toEqual(event("a", 4, "4"));
    expect(after.attach("a", 2)).toEqual([event("a", 3, "3"), event("a", 4, "4")]);
  });

  test("a run that has said nothing yet still exists after the process restarts", () => {
    const path = journalPath();
    const before = new RunOutbox(openRunDatabase(path));
    before.open("quiet");

    const after = new RunOutbox(openRunDatabase(path));
    expect(after.ids()).toEqual(["quiet"]);
    expect(after.push("quiet", (seq) => event("quiet", seq, "first"))).toEqual(
      event("quiet", 1, "first"),
    );
  });
});
