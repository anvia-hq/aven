import { describe, expect, test } from "bun:test";

import { parseRuntimeFrame } from "./wire";

const frame = (event: unknown) => JSON.stringify({ type: "run.event", runId: "r1", event });

describe("run events from a runtime", () => {
  test("a context event is accepted", () => {
    const event = { type: "context", usedTokens: 330, contextWindow: 1000 } as const;
    expect(parseRuntimeFrame(frame(event))).toEqual({ type: "run.event", runId: "r1", event });
  });

  test("a context event with nonsense numbers is refused", () => {
    expect(
      parseRuntimeFrame(frame({ type: "context", usedTokens: -1, contextWindow: 1000 })),
    ).toBeNull();
    expect(
      parseRuntimeFrame(frame({ type: "context", usedTokens: 1, contextWindow: 0 })),
    ).toBeNull();
  });

  test("events that are the control plane's to send are refused", () => {
    expect(parseRuntimeFrame(frame({ type: "done" }))).toBeNull();
  });
});
