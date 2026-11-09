import { describe, expect, test } from "bun:test";

import { createAddressingGate } from "./addressing-gate";
import type { AddressingInput } from "../decision-model/types";

const config = { kind: "jev-openrouter" as const, modelId: "m", apiKey: "k" };
const request = (prompt: string) => ({
  organizationId: "org",
  prompt,
  author: "Indra",
  owner: "Indra",
  recent: [],
});
const toRandy = "@[Randy](user:u-2) did you deploy the fix?";

function gateWith(options: {
  config?: typeof config | null | Error;
  scores?: { toAgent: number; toPerson: number } | null;
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
  test("a message that mentions nobody goes to the agent without asking the model", async () => {
    const { gate, asked } = gateWith({ scores: { toAgent: 0, toPerson: 1 } });
    expect(await gate(request("fix the build"))).toEqual({ agentAction: true, by: "fallback" });
    expect(asked).toEqual([]);
  });

  test("the model decides a mention, and is told who wrote it and who is mentioned", async () => {
    const said = gateWith({ scores: { toAgent: 0.05, toPerson: 0.97 } });
    expect(await said.gate(request(toRandy))).toEqual({ agentAction: false, by: "model" });
    expect(said.asked[0]).toMatchObject({
      author: "Indra",
      mentioned: ["Randy"],
      participants: ["Indra", "Randy"],
    });
    const both = gateWith({ scores: { toAgent: 0.9, toPerson: 0.9 } });
    expect(await both.gate(request(`${toRandy} then @agent fix it`))).toEqual({
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
