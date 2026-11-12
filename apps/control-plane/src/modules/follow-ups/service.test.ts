import { describe, expect, test } from "bun:test";

import type { ChatMessage } from "@aven/protocol/types";

import { createFollowUpGate } from "./gate";
import { createFollowUps } from "./service";
import { clean } from "./suggest";
import { followUpTranscript } from "./transcript";

const message = (role: ChatMessage["role"], text: string): ChatMessage =>
  ({ id: text, role, parts: [{ type: "text", text }] }) as ChatMessage;

const viewer = { organizationId: "org", userId: "user" };

describe("followUpTranscript", () => {
  test("is the end of the conversation when the agent spoke last", () => {
    const text = followUpTranscript([
      message("user", "Add Box cards"),
      message("assistant", "I can do it two ways."),
    ]);
    expect(text).toBe("User: Add Box cards\n\nAgent: I can do it two ways.");
  });

  test("is undefined while the user spoke last or the agent said nothing", () => {
    expect(followUpTranscript([message("user", "Hi")])).toBeUndefined();
    expect(followUpTranscript([message("user", "Hi"), message("assistant", " ")])).toBeUndefined();
    expect(followUpTranscript([])).toBeUndefined();
  });

  test("keeps the end of a long reply, where its question or proposal is", () => {
    const long = `${"x".repeat(3000)} Shall I go with Box cards?`;
    const text = followUpTranscript([message("user", "Go"), message("assistant", long)]);
    expect(text?.endsWith("Shall I go with Box cards?")).toBe(true);
    expect(text?.includes("x".repeat(3000))).toBe(false);
  });

  test("keeps only the last few messages", () => {
    const many = Array.from({ length: 8 }, (_, index) =>
      message(index % 2 === 0 ? "user" : "assistant", `m${index}`),
    );
    expect(followUpTranscript(many)?.includes("m3")).toBe(false);
    expect(followUpTranscript(many)?.includes("m4")).toBe(true);
  });
});

describe("clean", () => {
  test("trims and drops blanks and repeats", () => {
    expect(clean([" Go ", "Go", "", "Ship it"])).toEqual(["Go", "Ship it"]);
  });
});

describe("createFollowUps", () => {
  test("asks the small model only when the agent spoke last", async () => {
    const asked: string[] = [];
    const followUps = createFollowUps({
      messagesOf: async () => [message("user", "Go"), message("assistant", "Done.")],
      worthSuggesting: async () => true,
      suggest: async (_user, transcript) => {
        asked.push(transcript);
        return ["Run the tests"];
      },
    });
    expect(await followUps.forThread(viewer, "t")).toEqual({ suggestions: ["Run the tests"] });
    expect(asked).toHaveLength(1);

    const quiet = createFollowUps({
      messagesOf: async () => [message("user", "Go")],
      worthSuggesting: async () => true,
      suggest: async () => {
        throw new Error("must not be asked");
      },
    });
    expect(await quiet.forThread(viewer, "t")).toEqual({ suggestions: [] });
  });
});

describe("createFollowUps with the gate", () => {
  const long =
    "I can do it two ways: Box cards, or a plain list. Which one do you want me to build?";

  test("does not ask the small model when the gate says the reply is not worth it", async () => {
    const followUps = createFollowUps({
      messagesOf: async () => [message("user", "Go"), message("assistant", long)],
      worthSuggesting: async () => false,
      suggest: async () => {
        throw new Error("must not be asked");
      },
    });
    expect(await followUps.forThread(viewer, "t")).toEqual({ suggestions: [] });
  });

  test("gives the gate the workspace, the agent's reply and the transcript", async () => {
    const seen: string[][] = [];
    const followUps = createFollowUps({
      messagesOf: async () => [message("user", "Go"), message("assistant", long)],
      worthSuggesting: async (organizationId, reply, transcript) => {
        seen.push([organizationId, reply, transcript]);
        return true;
      },
      suggest: async () => ["Box cards"],
    });
    expect(await followUps.forThread(viewer, "t")).toEqual({ suggestions: ["Box cards"] });
    expect(seen).toEqual([["org", long, `User: Go\n\nAgent: ${long}`]]);
  });
});

describe("createFollowUpGate", () => {
  const config = { kind: "jev", modelId: "m", apiKey: "k" } as const;
  const reply = "I can do it two ways: Box cards, or a plain list. Which one do you want?";
  const gateWith = (score: number | null, configured = true) => {
    const asked: string[] = [];
    const gate = createFollowUpGate({
      configOf: async () => (configured ? config : null),
      deciderFor:
        () =>
        async ({ transcript }) => {
          asked.push(transcript);
          return score;
        },
    });
    return { gate, asked };
  };

  test("skips a short reply without asking the decision model", async () => {
    const { gate, asked } = gateWith(1);
    expect(await gate("org", "Done.", "Agent: Done.")).toBe(false);
    expect(asked).toEqual([]);
  });

  test("follows the decision model at the threshold", async () => {
    expect(await gateWith(0.5).gate("org", reply, "t")).toBe(true);
    expect(await gateWith(0.49).gate("org", reply, "t")).toBe(false);
    expect(await gateWith(0.9).gate("org", reply, "t")).toBe(true);
  });

  test("suggests as before when there is no decision model, or it could not answer", async () => {
    expect(await gateWith(0, false).gate("org", reply, "t")).toBe(true);
    expect(await gateWith(null).gate("org", reply, "t")).toBe(true);
  });

  test("suggests as before when the decision model's settings cannot be read", async () => {
    const gate = createFollowUpGate({
      configOf: async () => {
        throw new Error("key");
      },
      deciderFor: () => async () => 0,
    });
    expect(await gate("org", reply, "t")).toBe(true);
  });
});
