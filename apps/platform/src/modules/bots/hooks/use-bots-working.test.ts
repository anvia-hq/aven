import { beforeEach, describe, expect, test } from "bun:test";

import { botsWorkingStore } from "./use-bots-working";

class FakeEventSource {
  static opened: FakeEventSource[] = [];

  readonly url: string;
  closed = false;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeEventSource.opened.push(this);
  }

  close() {
    this.closed = true;
  }

  say(data: string) {
    this.onmessage?.({ data } as MessageEvent);
  }

  fail() {
    this.onerror?.();
  }
}

const globals = globalThis as unknown as { EventSource: unknown };

beforeEach(() => {
  FakeEventSource.opened = [];
  globals.EventSource = FakeEventSource;
});

const latest = () => {
  const opened = FakeEventSource.opened.at(-1);

  if (!opened) throw new Error("no source was opened");

  return opened;
};

describe("botsWorkingStore", () => {
  test("one source is shared by every subscriber, and a message reaches all of them", () => {
    let first = 0;
    let second = 0;
    const stopFirst = botsWorkingStore.subscribe(() => {
      first += 1;
    });
    const stopSecond = botsWorkingStore.subscribe(() => {
      second += 1;
    });

    expect(FakeEventSource.opened).toHaveLength(1);
    expect(latest().url).toBe("/api/bots/working");

    latest().say(JSON.stringify(["bot-a", "bot-b"]));

    expect(first).toBe(1);
    expect(second).toBe(1);
    expect([...botsWorkingStore.snapshot()]).toEqual(["bot-a", "bot-b"]);

    stopFirst();
    stopSecond();
  });

  test("the source opens with the first subscriber and closes with the last", () => {
    const stopFirst = botsWorkingStore.subscribe(() => {});
    const stopSecond = botsWorkingStore.subscribe(() => {});
    expect(FakeEventSource.opened).toHaveLength(1);

    stopFirst();
    expect(latest().closed).toBe(false);

    stopSecond();
    expect(latest().closed).toBe(true);

    const stopThird = botsWorkingStore.subscribe(() => {});
    expect(FakeEventSource.opened).toHaveLength(2);
    expect(latest().closed).toBe(false);

    stopThird();
    expect(latest().closed).toBe(true);
  });

  test("a lost connection keeps the last known set", () => {
    const stop = botsWorkingStore.subscribe(() => {});
    latest().say(JSON.stringify(["bot-a"]));
    expect([...botsWorkingStore.snapshot()]).toEqual(["bot-a"]);

    latest().fail();

    expect([...botsWorkingStore.snapshot()]).toEqual(["bot-a"]);

    stop();
  });

  test("the last known set is kept between subscribers, so it does not flicker", () => {
    const stop = botsWorkingStore.subscribe(() => {});
    latest().say(JSON.stringify(["bot-a"]));
    stop();

    const stopAgain = botsWorkingStore.subscribe(() => {});
    expect([...botsWorkingStore.snapshot()]).toEqual(["bot-a"]);

    latest().say(JSON.stringify([]));
    expect([...botsWorkingStore.snapshot()]).toEqual([]);

    stopAgain();
  });

  test("a message that is not a list of ids leaves the set alone", () => {
    const stop = botsWorkingStore.subscribe(() => {});
    latest().say(JSON.stringify(["bot-a"]));

    latest().say("not json");
    latest().say(JSON.stringify({ bots: ["bot-b"] }));
    expect([...botsWorkingStore.snapshot()]).toEqual(["bot-a"]);

    latest().say(JSON.stringify(["bot-b", 7, null, "bot-c"]));
    expect([...botsWorkingStore.snapshot()]).toEqual(["bot-b", "bot-c"]);

    stop();
  });

  test("the snapshot is stable between messages", () => {
    const stop = botsWorkingStore.subscribe(() => {});
    latest().say(JSON.stringify(["bot-a"]));

    expect(botsWorkingStore.snapshot()).toBe(botsWorkingStore.snapshot());

    stop();
  });
});
