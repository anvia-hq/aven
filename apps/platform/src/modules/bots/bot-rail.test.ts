import { expect, test } from "bun:test";

import { afterOpened, afterWorking, emptyRail } from "./bot-rail";

const working = (...ids: string[]) => new Set(ids);

test("a bot that starts working shows, after the ones already there", () => {
  const first = afterWorking(emptyRail, working("a"));
  expect(first.shown).toEqual(["a"]);

  expect(afterWorking(first, working("a", "b")).shown).toEqual(["a", "b"]);
});

test("a bot that finished stays shown", () => {
  const state = afterWorking(afterWorking(emptyRail, working("a")), working());

  expect(state.shown).toEqual(["a"]);
});

test("opening a bot that finished takes it out of the rail", () => {
  const state = afterWorking(afterWorking(emptyRail, working("a")), working());

  expect(afterOpened(state, "a", working()).shown).toEqual([]);
});

test("opening a bot that is still working keeps it there", () => {
  const state = afterWorking(emptyRail, working("a"));

  expect(afterOpened(state, "a", working("a")).shown).toEqual(["a"]);
});

test("a bot that was opened while working leaves the rail once it finishes", () => {
  const opened = afterOpened(afterWorking(emptyRail, working("a")), "a", working("a"));

  expect(afterWorking(opened, working()).shown).toEqual([]);
});

test("a bot that works again after being opened shows again", () => {
  const opened = afterOpened(afterWorking(emptyRail, working("a")), "a", working("a"));
  const finished = afterWorking(opened, working());

  expect(afterWorking(finished, working("a")).shown).toEqual(["a"]);
});

test("opening a bot that was never in the rail changes nothing", () => {
  expect(afterOpened(emptyRail, "a", working())).toBe(emptyRail);
});

test("nothing changing gives back the same state", () => {
  const state = afterWorking(emptyRail, working("a"));

  expect(afterWorking(state, working("a"))).toBe(state);
});

test("opening a bot that was already opened changes nothing", () => {
  const finished = afterWorking(afterWorking(emptyRail, working("a")), working());
  const opened = afterOpened(finished, "a", working());

  expect(afterOpened(opened, "a", working())).toBe(opened);
});
