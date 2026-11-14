import { afterEach, describe, expect, test } from "bun:test";

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

class MemoryStorage implements Storage {
  private readonly items = new Map<string, string>();

  get length() {
    return this.items.size;
  }

  key(index: number) {
    return [...this.items.keys()][index] ?? null;
  }

  getItem(key: string) {
    return this.items.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.items.set(key, value);
  }

  removeItem(key: string) {
    this.items.delete(key);
  }

  clear() {
    this.items.clear();
  }
}

function storeWith(keys: readonly string[]) {
  const store = new MemoryStorage();
  for (const key of keys) store.setItem(key, "x");
  Object.defineProperty(globalThis, "localStorage", { value: store, configurable: true });
  return store;
}

function keysOf(store: Storage) {
  return Array.from({ length: store.length }, (_, at) => store.key(at));
}

describe("stored keys", () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, "localStorage");
  });

  test("forgets only the keys it is given", () => {
    const store = storeWith(["aven.model-selection", "aven.threads.unread", "aven.theme"]);
    forgetStoredKeys(["aven.model-selection", "aven.threads.unread"]);
    expect(keysOf(store)).toEqual(["aven.theme"]);
  });

  test("forgets every key that starts with the prefix, and nothing else", () => {
    const store = storeWith([
      "aven.actions.favorites.a",
      "aven.actions.favorites.b",
      "aven.other",
      "aven.actions.favorites.c",
    ]);
    forgetStoredKeysStartingWith("aven.actions.favorites.");
    expect(keysOf(store)).toEqual(["aven.other"]);
  });

  test("does nothing without a browser store", () => {
    expect(() => forgetStoredKeysStartingWith("aven.actions.favorites.")).not.toThrow();
  });
});
