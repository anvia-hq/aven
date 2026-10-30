import { beforeAll, describe, expect, test } from "bun:test";

import { createState, readState } from "./service";

beforeAll(() => {
  process.env.BETTER_AUTH_SECRET ??= "test-secret";
});

describe("install state", () => {
  test("is accepted for the organization and user it was made for", () => {
    const state = createState("org-1", "user-1");
    expect(readState(state, "org-1", "user-1")).toEqual({ next: null });
  });

  test("is refused for another organization or user", () => {
    const state = createState("org-1", "user-1");
    expect(readState(state, "org-2", "user-1")).toBeNull();
    expect(readState(state, "org-1", "user-2")).toBeNull();
  });

  test("is refused when altered or expired", () => {
    const state = createState("org-1", "user-1", Date.now() - 2 * 60 * 60_000);
    expect(readState(state, "org-1", "user-1")).toBeNull();
    const [payload] = createState("org-1", "user-1").split(".");
    expect(readState(`${payload}.forged`, "org-1", "user-1")).toBeNull();
    expect(readState("garbage", "org-1", "user-1")).toBeNull();
  });
});

describe("where the state sends the browser back to", () => {
  test("is the path it was made with", () => {
    const state = createState("org-1", "user-1", Date.now(), "/threads/abc?panel=diff");
    expect(readState(state, "org-1", "user-1")).toEqual({ next: "/threads/abc?panel=diff" });
  });

  test("is never another site, even in a state we signed", () => {
    for (const next of ["https://evil.test/x", "//evil.test/x", "/\\evil.test", "evil"]) {
      const state = createState("org-1", "user-1", Date.now(), next);
      expect(readState(state, "org-1", "user-1")).toEqual({ next: null });
    }
  });
});
