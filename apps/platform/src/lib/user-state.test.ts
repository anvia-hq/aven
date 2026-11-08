import { describe, expect, test } from "bun:test";

import {
  accountKey,
  clearUserState,
  forgetStoredKeys,
  forgetStoredKeysStartingWith,
  registerUserState,
} from "./user-state";

describe("accountKey", () => {
  test("keeps two accounts apart", () => {
    expect(accountKey("one", "aven.files")).not.toBe(accountKey("two", "aven.files"));
  });

  test("keeps an account apart from no account", () => {
    expect(accountKey(null, "aven.files")).not.toBe(accountKey("one", "aven.files"));
  });

  test("is the same for the same account and key", () => {
    expect(accountKey("one", "aven.files\0/a.ts")).toBe(accountKey("one", "aven.files\0/a.ts"));
  });
});

describe("registerUserState", () => {
  test("runs what was registered when the person signs out", () => {
    let cleared = 0;
    registerUserState(() => {
      cleared += 1;
    });
    clearUserState();
    expect(cleared).toBe(1);
  });

  test("runs everything even when one throws", () => {
    let reached = 0;
    registerUserState(() => {
      throw new Error("cache gone");
    });
    registerUserState(() => {
      reached += 1;
    });
    expect(() => clearUserState()).not.toThrow();
    expect(reached).toBe(1);
  });

  test("runs nothing twice for one sign-out", () => {
    let cleared = 0;
    registerUserState(() => {
      cleared += 1;
    });
    clearUserState();
    expect(cleared).toBe(1);
  });
});

describe("stored keys", () => {
  test("forgets the keys it is given without a browser store", () => {
    expect(() => forgetStoredKeys(["aven.model-selection", "aven.threads.unread"])).not.toThrow();
  });

  test("forgets what starts with a prefix without a browser store", () => {
    expect(() => forgetStoredKeysStartingWith("aven.actions.favorites.")).not.toThrow();
  });
});
