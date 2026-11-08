import { expect, test } from "bun:test";
import { atom, getDefaultStore } from "jotai";

import { createCollection } from "./use-collection";

type Thing = { id: string };
type ThingInput = { title: string };

const store = getDefaultStore();

const neverAnswers = () => new Promise<Response>(() => undefined);

function collection() {
  const items = atom<Thing[] | null>(null);
  const made = createCollection<Thing, ThingInput, Partial<ThingInput>>({
    path: "/cockpit/things",
    atom: items,
    label: "things",
  });
  return { items, made };
}

async function withHangingFetch(run: () => Promise<void>) {
  const original = globalThis.fetch;
  globalThis.fetch = neverAnswers;
  try {
    await run();
  } finally {
    globalThis.fetch = original;
  }
}

test("reset lets a collection refresh again after a save was in flight at sign-out", async () => {
  await withHangingFetch(async () => {
    const { items, made } = collection();
    store.set(items, [{ id: "a" }]);
    void made.update({ id: "a" }, { title: "moved" }, "Could not save it");
    expect(made.refreshLoaded()).toBeUndefined();
    made.reset();
    store.set(items, [{ id: "a" }]);
    expect(made.refreshLoaded()).toBeDefined();
  });
});

test("reset lets a collection refresh again after a delete was in flight at sign-out", async () => {
  await withHangingFetch(async () => {
    const { items, made } = collection();
    store.set(items, [{ id: "a" }]);
    void made.remove({ id: "a" }, "Could not delete it");
    expect(made.refreshLoaded()).toBeUndefined();
    made.reset();
    store.set(items, [{ id: "a" }]);
    expect(made.refreshLoaded()).toBeDefined();
  });
});

test("reset empties the collection's data", async () => {
  await withHangingFetch(async () => {
    const { items, made } = collection();
    store.set(items, [{ id: "a" }]);
    made.reset();
    expect(store.get(items)).toBeNull();
    expect(made.refreshLoaded()).toBeUndefined();
  });
});
