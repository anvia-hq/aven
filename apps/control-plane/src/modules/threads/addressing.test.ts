import { describe, expect, test } from "bun:test";

import { addressingFrom, fallbackAddressing, namesAgent, personMentions } from "./addressing";

const randy = "@[Randy](user:u-2)";

describe("who a multiplayer message is for (decision 0191)", () => {
  test("person mentions are read from the text, once per person", () => {
    expect(personMentions(`${randy} and @[Randy again](user:u-2) and @[Sari](user:u-3)`)).toEqual([
      { id: "u-2", name: "Randy" },
      { id: "u-3", name: "Sari" },
    ]);
    expect(personMentions("look at @src/app.ts and email@example.com")).toEqual([]);
  });

  test("@agent counts only as a word of its own, and not inside a person's name", () => {
    expect(namesAgent("@agent please fix it")).toBe(true);
    expect(namesAgent("hey, @Agent, run it")).toBe(true);
    expect(namesAgent("@agents or me@agent.dev")).toBe(false);
    expect(namesAgent("@[@agent](user:u-9) look")).toBe(false);
  });

  test("without a model the agent acts unless the message only mentions a person", () => {
    expect(fallbackAddressing("fix the build")).toEqual({ agentAction: true, by: "fallback" });
    expect(fallbackAddressing(`${randy} did you see this?`)).toEqual({
      agentAction: false,
      by: "fallback",
    });
    expect(fallbackAddressing(`${randy} look, then @agent fix it`)).toEqual({
      agentAction: true,
      by: "fallback",
    });
  });

  test("the model keeps the agent out only when a person is clearly the one addressed", () => {
    expect(addressingFrom({ toPerson: 0.9 })).toEqual({ agentAction: false, by: "model" });
    expect(addressingFrom({ toPerson: 0.6 }).agentAction).toBe(false);
    expect(addressingFrom({ toPerson: 0.59 }).agentAction).toBe(true);
    expect(addressingFrom({ toPerson: 0.1 }).agentAction).toBe(true);
  });
});
