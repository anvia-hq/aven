import { describe, expect, test } from "bun:test";
import type { BotScheduleView } from "@aven/protocol/schedules";

import {
  createScheduleTools,
  CREATE_SCHEDULE_TOOL_NAME,
  DELETE_SCHEDULE_TOOL_NAME,
  LIST_SCHEDULES_TOOL_NAME,
  UPDATE_SCHEDULE_TOOL_NAME,
  type ScheduleHost,
} from "./schedules";

const ID = "11111111-2222-4333-8444-555555555555";
const view: BotScheduleView = {
  id: ID,
  bot: "main",
  name: "Morning news",
  cron: "0 7 * * *",
  timezone: "Asia/Jakarta",
  prompt: "Read the news.",
  enabled: true,
  nextRun: "2026-10-19T00:00:00.000Z",
  lastRun: null,
  lastStatus: null,
};

function host() {
  const calls: unknown[] = [];
  const hosted: ScheduleHost = {
    list: async () => (calls.push(["list"]), [view]),
    create: async (input) => (calls.push(["create", input]), view),
    update: async (id, patch) => (calls.push(["update", id, patch]), view),
    remove: async (id) => void calls.push(["remove", id]),
  };
  const [create, list, update, remove] = createScheduleTools(hosted);
  return { calls, create, list, update, remove };
}

describe("the schedule tools", () => {
  test("are four, named for what they do", () => {
    const { create, list, update, remove } = host();
    expect([create.name, list.name, update.name, remove.name]).toEqual([
      CREATE_SCHEDULE_TOOL_NAME,
      LIST_SCHEDULES_TOOL_NAME,
      UPDATE_SCHEDULE_TOOL_NAME,
      DELETE_SCHEDULE_TOOL_NAME,
    ]);
  });

  test("create hands the host what the model chose and returns the schedule", async () => {
    const { calls, create } = host();
    const result = await create.call({
      name: " Morning news ",
      cron: "0 7 * * *",
      prompt: "Read the news.",
      bot: "scout",
    });
    expect(calls).toEqual([
      [
        "create",
        { name: "Morning news", cron: "0 7 * * *", prompt: "Read the news.", bot: "scout" },
      ],
    ]);
    expect(result).toEqual({ schedule: view });
  });

  test("update gives only what changes, by id, and delete takes the id", async () => {
    const { calls, update, remove } = host();
    await update.call({ id: ID, enabled: false });
    await remove.call({ id: ID });
    expect(calls).toEqual([
      ["update", ID, { enabled: false }],
      ["remove", ID],
    ]);
  });

  test("list returns every schedule", async () => {
    expect(await host().list.call({})).toEqual({ schedules: [view] });
  });

  test("an id that is not an id, or a task with nothing in it, is refused before the host is asked", async () => {
    const { calls, create, update, remove } = host();
    await expect(update.call({ id: "not-an-id" })).rejects.toThrow();
    await expect(remove.call({ id: "x" })).rejects.toThrow();
    await expect(create.call({ name: "n", cron: "0 7 * * *", prompt: " " })).rejects.toThrow();
    expect(calls).toEqual([]);
  });

  test("a refusal of the host reaches the model as the tool's error", async () => {
    const refusing: ScheduleHost = {
      list: async () => [],
      create: async () => {
        throw new Error("Schedules can run at most once every 15 minutes.");
      },
      update: async () => view,
      remove: async () => undefined,
    };
    const [create] = createScheduleTools(refusing);
    await expect(create.call({ name: "n", cron: "* * * * *", prompt: "p" })).rejects.toThrow(
      "every 15 minutes",
    );
  });
});
