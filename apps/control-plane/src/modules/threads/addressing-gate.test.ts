import { describe, expect, test } from "bun:test";

import { createAddressingGate, recentOf } from "./addressing-gate";
import type { AddressingInput } from "../decision-model/types";

const config = { kind: "jev-openrouter" as const, modelId: "m", apiKey: "k" };
const request = (prompt: string) => ({
  organizationId: "org",
  prompt,
  author: "Indra",
  owner: "Indra",
  recent: [] as { author: string; text: string }[],
});
const toRandy = "@[Randy](user:u-2) did you deploy the fix?";

function gateWith(options: {
  config?: typeof config | null | Error;
  scores?: { toPerson: number } | null;
}) {
  const asked: AddressingInput[] = [];
  const gate = createAddressingGate({
    configOf: async () => {
      if (options.config instanceof Error) throw options.config;

      return options.config === undefined ? config : options.config;
    },
    deciderFor: () => async (input) => {
      asked.push(input);
      return options.scores ?? null;
    },
  });
  return { gate, asked };
}

describe("the gate on a multiplayer message (decision 0191)", () => {
  test("a message that mentions nobody is asked of the model too, with who spoke before", async () => {
    const { gate, asked } = gateWith({ scores: { toPerson: 0.9 } });
    const follow = {
      ...request("I think we discussed the feature to add."),
      recent: [{ author: "Indra", text: "Bro @Randy you can work with the agent." }],
    };
    expect(await gate(follow)).toEqual({ agentAction: false, by: "model" });
    expect(asked[0]).toMatchObject({
      mentioned: [],
      participants: ["Indra"],
      recent: follow.recent,
    });
  });

  test("@agent goes to the agent without asking the model", async () => {
    const { gate, asked } = gateWith({ scores: { toPerson: 1 } });
    expect(await gate(request("@agent fix the build"))).toEqual({
      agentAction: true,
      by: "fallback",
    });
    expect(asked).toEqual([]);
  });

  test("a message that mentions nobody goes to the agent when the model cannot say", async () => {
    const { gate } = gateWith({ scores: null });
    expect(await gate(request("fix the build"))).toEqual({ agentAction: true, by: "fallback" });
  });

  test("the model decides a mention, and is told who wrote it and who is mentioned", async () => {
    const said = gateWith({ scores: { toPerson: 0.97 } });
    expect(await said.gate(request(toRandy))).toEqual({ agentAction: false, by: "model" });
    expect(said.asked[0]).toMatchObject({
      author: "Indra",
      mentioned: ["Randy"],
      participants: ["Indra", "Randy"],
    });
    expect(said.asked[0]?.message).toBe("@Randy did you deploy the fix?");
    const both = gateWith({ scores: { toPerson: 0.3 } });
    expect(await both.gate(request(`${toRandy} and please fix it`))).toEqual({
      agentAction: true,
      by: "model",
    });
  });

  test("without a model, with an unreadable key, or when the model fails, the text decides", async () => {
    for (const options of [
      { config: null },
      { config: new Error("Stored secret is malformed") },
      { scores: null },
    ]) {
      const { gate } = gateWith(options);
      expect(await gate(request(toRandy))).toEqual({ agentAction: false, by: "fallback" });
      expect(await gate(request(`${toRandy} @agent please fix it`))).toEqual({
        agentAction: true,
        by: "fallback",
      });
    }
  });
});

describe("the recent messages the model is shown", () => {
  const said = (role: "user" | "assistant", text: string, senderId?: string) => ({
    id: crypto.randomUUID(),
    role,
    parts: [{ type: "text" as const, text }],
    senderId,
  });

  test("name who wrote each, with mentions as plain names", () => {
    const recent = recentOf(
      [
        said("user", "[driver: Randy] ok", "u-2"),
        said("user", "Bro @[Randy](user:u-2) hi", "u-1"),
        said("assistant", "Hello"),
      ] as never,
      new Map([["u-1", "Indra"]]),
    );
    expect(recent).toEqual([
      { author: "Randy", text: "ok" },
      { author: "Indra", text: "Bro @Randy hi" },
      { author: "agent", text: "Hello" },
    ]);
  });
});
