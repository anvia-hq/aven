import { describe, expect, test } from "bun:test";

import { cockpitActivityOf } from "./activity";
import { cockpitPulses } from "./pulses";

const bot = { kind: "bot" as const, name: "Aven" };
const thread = { kind: "thread" as const, name: "Fix the release" };

describe("cockpit activity", () => {
  test("says who did what in the cockpit, and whether it changed anything", () => {
    expect(cockpitActivityOf(bot, { command: "list", kind: "tasks" })).toMatchObject({
      actor: "bot",
      source: "Aven",
      summary: "looked at your tasks",
      changed: false,
    });
    expect(cockpitActivityOf(bot, { command: "get", kind: "notes", id: "n1" })).toMatchObject({
      summary: "read a note",
      changed: false,
    });
    expect(cockpitActivityOf(bot, { command: "tags" })).toMatchObject({
      summary: "looked at your tags",
      changed: false,
    });
    expect(
      cockpitActivityOf(bot, { command: "create", kind: "tasks", fields: { title: "Ship" } }),
    ).toMatchObject({ summary: 'added a task "Ship"', changed: true });
    expect(
      cockpitActivityOf(thread, { command: "update", kind: "inbox", id: "i1", fields: {} }),
    ).toMatchObject({
      actor: "thread",
      source: "Fix the release",
      summary: "changed an inbox item",
    });
    expect(cockpitActivityOf(bot, { command: "delete", kind: "notes", id: "n1" })).toMatchObject({
      summary: "deleted a note",
      changed: true,
    });
    expect(cockpitActivityOf(bot, { command: "convert", id: "i1" })).toMatchObject({
      summary: "turned an inbox item into a task",
      changed: true,
    });
  });

  test("a watcher hears its own person's activity and nobody else's", async () => {
    const person = crypto.randomUUID();
    const other = crypto.randomUUID();
    const watching = new AbortController();
    const stream = cockpitPulses.watch(person, watching.signal);
    const waiting = stream.next();
    const activity = cockpitActivityOf(thread, { command: "list", kind: "inbox" });

    cockpitPulses.publish(other, activity);
    cockpitPulses.publish(person, activity);

    expect((await waiting).value).toMatchObject({
      source: "Fix the release",
      summary: "looked at your inbox",
    });

    watching.abort();
    await stream.return(undefined);
  });
});
