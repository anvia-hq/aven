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

function modelAnswering(probabilities: Record<string, number>, delayMs = 0): AddressingModel {
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
      const answers = Object.fromEntries(
        Object.keys(request.questions).map((name) => [
          name,
          { type: "check", probability: probabilities[name] ?? 0.5 },
        ]),
      );
      return { answers, rawResponse: null } as never;
    },
  };
}

describe("asking the decision model who a message is for (decision 0191)", () => {
  test("both questions are answered and read as scores", async () => {
    const decide = addressingDecider(modelAnswering({ toAgent: 0.07, toPerson: 0.98 }));
    expect(await decide(input)).toEqual({ toAgent: 0.07, toPerson: 0.98 });
  });

  test("a model that fails or is too slow answers nothing, so the caller falls back", async () => {
    const failing: AddressingModel = {
      ...modelAnswering({}),
      decision: async () => {
        throw new Error("down");
      },
    };
    const quiet = console.error;
    console.error = () => undefined;
    try {
      expect(await addressingDecider(failing)(input)).toBeNull();
      expect(await addressingDecider(modelAnswering({}, 200), 20)(input)).toBeNull();
    } finally {
      console.error = quiet;
    }
  });
});
