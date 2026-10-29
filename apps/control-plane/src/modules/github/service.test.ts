import { beforeAll, describe, expect, test } from "bun:test";

import { createState, stateMatches } from "./service";

beforeAll(() => {
  process.env.BETTER_AUTH_SECRET ??= "test-secret";
});

describe("install state", () => {
  test("is accepted for the organization and user it was made for", () => {
    const state = createState("org-1", "user-1");
    expect(stateMatches(state, "org-1", "user-1")).toBe(true);
  });

  test("is refused for another organization or user", () => {
    const state = createState("org-1", "user-1");
    expect(stateMatches(state, "org-2", "user-1")).toBe(false);
    expect(stateMatches(state, "org-1", "user-2")).toBe(false);
  });

  test("is refused when altered or expired", () => {
    const state = createState("org-1", "user-1", Date.now() - 2 * 60 * 60_000);
    expect(stateMatches(state, "org-1", "user-1")).toBe(false);
    const [payload] = createState("org-1", "user-1").split(".");
    expect(stateMatches(`${payload}.forged`, "org-1", "user-1")).toBe(false);
    expect(stateMatches("garbage", "org-1", "user-1")).toBe(false);
  });
});
