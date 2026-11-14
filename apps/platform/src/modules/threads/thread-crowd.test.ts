import { describe, expect, test } from "bun:test";

import { crowdOf } from "./thread-crowd";
import type { Thread } from "./types";

const thread = (extra: Partial<Thread> = {}) =>
  ({
    createdBy: "u-1",
    createdByName: "Indra",
    createdByImage: null,
    participants: [],
    drivingUntil: null,
    ...extra,
  }) as Thread;
const person = (n: number) => ({ id: `u-${n}`, name: `Person ${n}`, image: null });

describe("the people shown on a multiplayer thread", () => {
  test("a thread nobody else has joined, and that is not open to others, shows nobody", () => {
    expect(crowdOf(thread())).toBeNull();
    expect(crowdOf(thread({ participants: [person(1)] }))).toBeNull();
  });

  test("each person comes with their photo, the creator's from the thread", () => {
    const creatorImage = "/api/users/u-1/avatar?v=1";
    const crowd = crowdOf(
      thread({
        createdByImage: creatorImage,
        participants: [{ id: "u-2", name: "Person 2", image: "/api/users/u-2/avatar?v=2" }],
      }),
    );
    expect(crowd?.shown.map((p) => p.image)).toEqual([creatorImage, "/api/users/u-2/avatar?v=2"]);
  });

  test("a thread that has had multiplayer and no longer shows who wrote", () => {
    const crowd = crowdOf(thread({ participants: [person(2)] }));
    expect(crowd?.shown.map((p) => p.id)).toEqual(["u-1", "u-2"]);
    expect(crowd?.more).toBe(0);
  });
});
