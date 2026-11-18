import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { draftKey, readDraft, writeDraft } from "./drafts";
import type { DraftFileMeta } from "./types";

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

let store: MemoryStorage;

beforeEach(() => {
  store = new MemoryStorage();
  Object.defineProperty(globalThis, "localStorage", { value: store, configurable: true });
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, "localStorage");
});

const shot: DraftFileMeta = { id: "file-1", name: "shot.png", type: "image/png", size: 1024 };

describe("readDraft", () => {
  test("reads a record saved before files were kept", () => {
    store.setItem(draftKey("t1"), JSON.stringify({ input: "half a thought", entities: [] }));

    expect(readDraft("t1")).toEqual({
      v: 1,
      input: "half a thought",
      entities: [],
      files: [],
    });
  });

  test("keeps the files it can read and drops the rest", () => {
    store.setItem(
      draftKey("t1"),
      JSON.stringify({
        v: 1,
        input: "",
        entities: [],
        files: [shot, { name: "no id" }, null, { id: "file-2", name: "spec.pdf", size: 12 }],
      }),
    );

    expect(readDraft("t1")?.files).toEqual([
      shot,
      { id: "file-2", name: "spec.pdf", type: "", size: 12 },
    ]);
  });

  test("ignores a record it cannot read", () => {
    store.setItem(draftKey("t1"), "not json");

    expect(readDraft("t1")).toBeNull();
  });

  test("reads no draft where nothing was saved", () => {
    expect(readDraft("t1")).toBeNull();
  });
});

describe("writeDraft", () => {
  test("keeps a draft that is only a file", () => {
    writeDraft("t1", { input: "", entities: [], files: [shot] });

    expect(store.length).toBe(1);
    expect(readDraft("t1")?.files).toEqual([shot]);
  });

  test("keeps the text, its mentions and its files together", () => {
    writeDraft("t1", { input: "look at this", entities: [], files: [shot] });

    expect(readDraft("t1")).toEqual({
      v: 1,
      input: "look at this",
      entities: [],
      files: [shot],
    });
  });

  test("forgets a draft with no text and no files", () => {
    writeDraft("t1", { input: "look at this", entities: [], files: [shot] });
    writeDraft("t1", { input: "", entities: [], files: [] });

    expect(store.length).toBe(0);
  });

  test("keeps each thread's draft apart", () => {
    writeDraft("t1", { input: "one", entities: [], files: [] });
    writeDraft("t2", { input: "two", entities: [], files: [] });

    expect(readDraft("t1")?.input).toBe("one");
    expect(readDraft("t2")?.input).toBe("two");
  });
});
