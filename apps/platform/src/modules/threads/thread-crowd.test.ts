import { describe, expect, test } from "bun:test";

import { crowdOf } from "./thread-crowd";
import type { Thread } from "./types";

const DAY = 24 * 60 * 60 * 1000;
const thread = (extra: Partial<Thread> = {}) =>
  ({
    createdBy: "u-1",
    createdByName: "Indra",
    participants: [],
    drivingUntil: null,
    ...extra,
  }) as Thread;
const person = (n: number) => ({ id: `u-${n}`, name: `Person ${n}` });

describe("the people shown on a multiplayer thread", () => {
  test("a thread nobody else has joined, and that is not open to others, shows nobody", () => {
    expect(crowdOf(thread())).toBeNull();
    expect(crowdOf(thread({ participants: [person(1)] }))).toBeNull();
  });

  test("multiplayer being on shows the creator even before anyone writes", () => {
    const drivingUntil = new Date(Date.now() + DAY).toISOString();
    expect(crowdOf(thread({ drivingUntil }))?.shown).toEqual([{ id: "u-1", name: "Indra" }]);
  });

  test("the creator comes first, then those who wrote, and three at most are shown, with how many more", () => {
    const crowd = crowdOf(thread({ participants: [person(2), person(3), person(4), person(5)] }));
    expect(crowd?.shown.map((p) => p.id)).toEqual(["u-1", "u-2", "u-3"]);
    expect(crowd?.more).toBe(2);
    expect(crowd?.names).toEqual(["Indra", "Person 2", "Person 3", "Person 4", "Person 5"]);
  });

  test("a thread that has had multiplayer and no longer shows who wrote", () => {
    const crowd = crowdOf(thread({ participants: [person(2)] }));
    expect(crowd?.shown.map((p) => p.id)).toEqual(["u-1", "u-2"]);
    expect(crowd?.more).toBe(0);
  });
});
