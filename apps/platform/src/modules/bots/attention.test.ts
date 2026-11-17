import { describe, expect, test } from "bun:test";

import { attentionBots, attentionQueue } from "./attention";
import type { Bot, BotAttention } from "./types";

const bot = (id: string, attention: BotAttention | null, createdAt = "2026-01-01T00:00:00.000Z") =>
  ({
    id,
    name: id,
    handle: id,
    instruction: "",
    description: "",
    avatar: "",
    providerId: null,
    modelId: null,
    reasoningEffort: null,
    compactAfterTokens: null,
    hasComputer: true,
    runtimeId: null,
    isMain: false,
    attention,
    createdAt,
    updatedAt: createdAt,
  }) satisfies Bot;

const quiet = (id: string) => bot(id, null);
const waiting = (id: string, since: string, createdAt?: string) =>
  bot(id, { reason: "question", since }, createdAt);

describe("attentionBots", () => {
  test("keeps only the bots that need the person, longest-waiting first", () => {
    const bots = [
      quiet("a"),
      waiting("b", "2026-01-03T00:00:00.000Z"),
      quiet("c"),
      waiting("d", "2026-01-02T00:00:00.000Z"),
    ];
    expect(attentionBots(bots).map((each) => each.id)).toEqual(["d", "b"]);
  });

  test("splits a tie by the bot that was made first", () => {
    const since = "2026-01-02T00:00:00.000Z";
    const bots = [
      waiting("late", since, "2026-01-02T00:00:00.000Z"),
      waiting("early", since, "2026-01-01T00:00:00.000Z"),
    ];
    expect(attentionBots(bots).map((each) => each.id)).toEqual(["early", "late"]);
  });

  test("leaves the main bot out, because the queue puts it first", () => {
    const bots = [
      { ...bot("aven", { reason: "message", since: "2026-01-05T00:00:00.000Z" }), isMain: true },
      waiting("scout", "2026-01-02T00:00:00.000Z"),
    ];
    expect(attentionBots(bots).map((each) => each.id)).toEqual(["scout"]);
    expect(attentionBots(bots, new Set(["aven"])).map((each) => each.id)).toEqual(["scout"]);
  });

  test("shows a bot that is working even when it needs nothing, after the ones that do", () => {
    const bots = [waiting("scout", "2026-01-02T00:00:00.000Z"), quiet("writer"), quiet("ops")];
    expect(attentionBots(bots, new Set(["writer", "ops"])).map((each) => each.id)).toEqual([
      "scout",
      "writer",
      "ops",
    ]);
    expect(attentionBots(bots).map((each) => each.id)).toEqual(["scout"]);
  });
});

describe("attentionQueue", () => {
  const aven = { ...bot("aven", null), isMain: true };

  test("puts the main bot first, then the bots that need the person", () => {
    const bots = [
      waiting("scout", "2026-01-02T00:00:00.000Z"),
      aven,
      waiting("writer", "2026-01-03T00:00:00.000Z"),
      quiet("ops"),
    ];
    expect(attentionQueue(bots).map((each) => each.id)).toEqual(["aven", "scout", "writer"]);
  });

  test("is the main bot alone when nothing needs the person", () => {
    expect(attentionQueue([aven, quiet("scout")]).map((each) => each.id)).toEqual(["aven"]);
  });

  test("takes a working bot too", () => {
    expect(
      attentionQueue([aven, quiet("scout")], new Set(["scout"])).map((each) => each.id),
    ).toEqual(["aven", "scout"]);
  });

  test("is empty before the person's bots have loaded", () => {
    expect(attentionQueue([])).toEqual([]);
  });
});
