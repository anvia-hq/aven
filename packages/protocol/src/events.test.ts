import { describe, expect, test } from "bun:test";

import { applyEvent, isRunning, type ChatMessage, type RunEvent } from "./events";

type Fixture = {
  name: string;
  events: RunEvent[];
  expected: { messages: ChatMessage[]; running: boolean };
};

// The same fixtures drive the Swift client's tests (clients/macos), so the two reducers cannot
// drift apart without one of the suites failing.
const fixtures: Fixture[] = await Bun.file(
  new URL("../fixtures/reducer.json", import.meta.url),
).json();

describe("applyEvent", () => {
  for (const fixture of fixtures) {
    test(fixture.name, () => {
      let messages: ChatMessage[] = [];
      let running = false;
      for (const event of fixture.events) {
        messages = applyEvent(messages, event);
        running = isRunning(running, event);
      }
      expect({ messages, running }).toEqual(fixture.expected);
    });
  }
});
