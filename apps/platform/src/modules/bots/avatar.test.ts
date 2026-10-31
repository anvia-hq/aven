import { describe, expect, test } from "bun:test";

import {
  avatarFor,
  colors,
  faces,
  families,
  formatAvatarSetting,
  parseAvatarSetting,
  randomSeed,
} from "./avatar";

describe("avatarFor", () => {
  test("is the same character every time for the same bot, and its own for another", () => {
    const first = avatarFor("0b6f7d5e-1111-4222-8333-444455556666");
    expect(avatarFor("0b6f7d5e-1111-4222-8333-444455556666")).toEqual(first);
    expect(avatarFor("another-bot")).not.toEqual(first);
  });

  test("spreads over the shapes, colors and faces instead of favouring a few", () => {
    const looks = Array.from({ length: 600 }, (_, index) => avatarFor(`bot-${index}`));
    expect(new Set(looks.map((look) => look.family)).size).toBe(families.length);
    expect(new Set(looks.map((look) => look.color)).size).toBe(colors.length);
    expect(new Set(looks.map((look) => look.face)).size).toBe(faces.length);
    expect(
      new Set(looks.map((look) => `${look.family}${look.color}${look.face}`)).size,
    ).toBeGreaterThan(300);
  });

  test("keeps what was chosen, and draws the rest from the seed it is given instead of the id", () => {
    const chosen = avatarFor("bot", { family: "hexagon", color: "#ff7a00" });
    expect(chosen).toMatchObject({ family: "hexagon", color: "#ff7a00" });
    // A shape or color picked on its own leaves the face and the bob to the same seed as before.
    expect(chosen.face).toBe(avatarFor("bot").face);
    expect(chosen.delay).toBe(avatarFor("bot").delay);

    expect(avatarFor("bot", { seed: "abc" })).toEqual(avatarFor("other", { seed: "abc" }));
    expect(avatarFor("bot", { seed: "abc" })).not.toEqual(avatarFor("bot"));
  });

  test("every shape says how far it reaches, which a bot at work gives off its ring around", () => {
    for (const family of families) {
      expect(family.reach).toBeGreaterThan(10);
      expect(avatarFor("bot", { family: family.name }).reach).toBe(family.reach);
    }
  });

  test("a shape that does not exist falls back to the one the seed gives", () => {
    expect(avatarFor("bot", { family: "blob" }).family).toBe(avatarFor("bot").family);
  });
});

describe("a bot's avatar setting as it is kept", () => {
  test("reads back as what was written", () => {
    const setting = { seed: "ab12cd34", family: "star", color: "#ff1f57" };
    expect(parseAvatarSetting(formatAvatarSetting(setting))).toEqual(setting);
    expect(parseAvatarSetting(formatAvatarSetting({ color: "#ff7a00" }))).toEqual({
      color: "#ff7a00",
    });
    expect(parseAvatarSetting("{}")).toEqual({});
  });

  test("is nothing when it is empty or is not a setting: a text, a part that is malformed or unknown", () => {
    for (const other of [
      "",
      "🐦",
      "[]",
      "null",
      '{"color":"red"}',
      '{"family":"Not A Shape!"}',
      '{"seed":""}',
      `{"seed":"${"x".repeat(65)}"}`,
      '{"image":"a/b.png"}',
    ]) {
      expect(parseAvatarSetting(other)).toBeNull();
    }
  });

  test("a setting fits what a bot's avatar may hold", () => {
    const widest = formatAvatarSetting({
      seed: "x".repeat(64),
      family: "triangle".padEnd(12, "x"),
      color: "#ffffff",
    });
    expect(widest.length).toBeLessThanOrEqual(120);
  });

  test("random seeds are short and differ", () => {
    expect(randomSeed()).toMatch(/^[0-9a-f]{8}$/);
    expect(randomSeed()).not.toBe(randomSeed());
  });
});
