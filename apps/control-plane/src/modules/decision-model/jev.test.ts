import { describe, expect, test } from "bun:test";

import type { AddressingModel } from "./types";
import { addressingDecider } from "./jev";

const input = {
  message: "@[Randy](user:u-2) did you deploy?",
  author: "Indra",
  mentioned: ["Randy"],
  participants: ["Indra", "Randy"],
  recent: [],
};

function modelAnswering(person: number, delayMs = 0): AddressingModel {
  return {
    provider: "fake",
    modelId: "fake",
    capabilities: {
      questionSupport: {
        choice: "native",
        "multi-label": "native",
        score: "native",
        check: "native",
      },
      mixedQuestions: true,
    },
    async decision(request, options) {
      if (delayMs > 0) {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(resolve, delayMs);
          options?.abortSignal?.addEventListener("abort", () => {
            clearTimeout(timer);
            reject(options.abortSignal?.reason);
          });
        });
      }
      const answers = {
        addressee: {
          type: "choice",
          choice: person >= 0.5 ? "person" : "agent",
          probabilities: { agent: 1 - person, person },
          confidence: Math.max(person, 1 - person),
        },
      };
      return { answers, rawResponse: null } as never;
    },
  };
}

describe("asking the decision model who a message is for (decision 0191)", () => {
  test("one choice between the agent and a person is asked, and its person share is the score", async () => {
    const asked: string[][] = [];
    const model = modelAnswering(0.98);
    const decide = addressingDecider({
      ...model,
      decision: (request, options) => {
        asked.push(Object.keys(request.questions));
        return model.decision(request, options);
      },
    });
    expect(await decide(input)).toEqual({ toPerson: 0.98 });
    expect(asked).toEqual([["addressee"]]);
  });

  test("a model that fails or is too slow answers nothing, so the caller falls back", async () => {
    const failing: AddressingModel = {
      ...modelAnswering(0),
      decision: async () => {
        throw new Error("down");
      },
    };
    const quiet = console.error;
    console.error = () => undefined;
    try {
      expect(await addressingDecider(failing)(input)).toBeNull();
      expect(await addressingDecider(modelAnswering(0, 200), 20)(input)).toBeNull();
    } finally {
      console.error = quiet;
    }
  });
});
