import { beforeAll, describe, expect, test } from "bun:test";

import { createState, readState } from "./service";

beforeAll(() => {
  process.env.BETTER_AUTH_SECRET ??= "test-secret";
});

describe("install state", () => {
  test("is accepted for the organization and user it was made for", () => {
    const state = createState("org-1", "user-1");
    expect(readState(state, "org-1", "user-1")).toEqual({
      next: null,
      installationId: null,
      appKey: "platform",
    });
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

describe("the installation a state names", () => {
  test("comes back with the state, and only for the user it was made for", () => {
    const state = createState("org-1", "user-1", Date.now(), undefined, 42);
    expect(readState(state, "org-1", "user-1")).toEqual({
      next: null,
      installationId: 42,
      appKey: "platform",
    });
    expect(readState(state, "org-1", "user-2")).toBeNull();
  });

  test("is none for a state made without one", () => {
    const state = createState("org-1", "user-1", Date.now(), "/x");
    expect(readState(state, "org-1", "user-1")).toEqual({
      next: "/x",
      installationId: null,
      appKey: "platform",
    });
  });
});

describe("where the state sends the browser back to", () => {
  test("is the path it was made with", () => {
    const state = createState("org-1", "user-1", Date.now(), "/threads/abc?panel=diff");
    expect(readState(state, "org-1", "user-1")).toEqual({
      next: "/threads/abc?panel=diff",
      installationId: null,
      appKey: "platform",
    });
  });

  test("is never another site, even in a state we signed", () => {
    for (const next of ["https://evil.test/x", "//evil.test/x", "/\\evil.test", "evil"]) {
      const state = createState("org-1", "user-1", Date.now(), next);
      expect(readState(state, "org-1", "user-1")).toEqual({
        next: null,
        installationId: null,
        appKey: "platform",
      });
    }
  });
});

describe("install state for an app", () => {
  test("names the app it was made for, and the platform's when none", () => {
    const own = createState("org-1", "user-1", Date.now(), "/x", undefined, "app-1");
    expect(readState(own, "org-1", "user-1")).toEqual({
      next: "/x",
      installationId: null,
      appKey: "app-1",
    });
    const claim = createState("org-1", "user-1", Date.now(), undefined, 7, "app-1");
    expect(readState(claim, "org-1", "user-1")).toMatchObject({
      installationId: 7,
      appKey: "app-1",
    });
  });
});
