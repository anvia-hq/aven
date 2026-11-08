import { afterEach, expect, test } from "bun:test";
import { atom, getDefaultStore } from "jotai";

import { createListStore } from "./list-store";

type Item = { id: string };

type Answer = { body?: Item[]; status?: number };

const store = getDefaultStore();
const server = globalThis.fetch;
let waiting: ((answer: Answer) => void)[] = [];

function serve() {
  waiting = [];
  globalThis.fetch = (() =>
    new Promise<Response>((resolve) => {
      waiting.push(({ body, status = 200 }) =>
        resolve(new Response(body === undefined ? "" : JSON.stringify(body), { status })),
      );
    })) as unknown as typeof fetch;
}

function answer(index: number, from: Answer = {}) {
  waiting[index](from);
}

function things() {
  const items = atom<Item[] | null>(null);
  const list = createListStore<Item>({ path: "/things", atom: items, label: "things" });
  return { items, list };
}

afterEach(() => {
  globalThis.fetch = server;
});

test("a refresh after a change fetches again instead of joining the request already running", async () => {
  serve();
  const { items, list } = things();

  const stale = list.refresh();
  expect(waiting.length).toBe(1);

  const afterChange = list.refresh();
  expect(waiting.length).toBe(2);

  answer(1, { body: [{ id: "changed" }] });
  answer(0, { body: [{ id: "before" }] });
  await Promise.all([stale, afterChange]);

  expect(store.get(items)).toEqual([{ id: "changed" }]);
});

test("a response from a request that started before a change does not replace the newer list", async () => {
  serve();
  const { items, list } = things();

  const stale = list.refresh();
  const afterChange = list.refresh();

  answer(1, { body: [{ id: "changed" }] });
  await afterChange;
  expect(store.get(items)).toEqual([{ id: "changed" }]);

  answer(0, { body: [{ id: "before" }] });
  await stale;
  expect(store.get(items)).toEqual([{ id: "changed" }]);
});

test("a failed refresh leaves the store able to fetch again", async () => {
  serve();
  const { items, list } = things();

  const failed = list.refresh();
  answer(0, { status: 500 });
  await failed;
  expect(store.get(items)).toEqual([]);

  const next = list.refresh();
  expect(waiting.length).toBe(2);
  answer(1, { body: [{ id: "later" }] });
  await next;
  expect(store.get(items)).toEqual([{ id: "later" }]);
});

test("a failed refresh keeps the list it already had", async () => {
  serve();
  const { items, list } = things();
  store.set(items, [{ id: "kept" }]);

  const failed = list.refresh();
  answer(0, { status: 500 });
  await failed;

  expect(store.get(items)).toEqual([{ id: "kept" }]);
});
