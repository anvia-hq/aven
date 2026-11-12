import { describe, expect, test } from "bun:test";

import { CLAUDE_TOKEN_MISSING } from "@aven/protocol/runtime-wire";

import { ClaudeTokenMissingError, claudeTokenForRun, claudeTokenOf } from "./token";

const TOKEN_A = "setup-token-for-alice-0001";
const TOKEN_B = "setup-token-for-bob-00002";

describe("a Claude setup token belongs to the thread's owner", () => {
  test("reads only the owner it is asked for", async () => {
    const read: string[] = [];
    const token = await claudeTokenOf("alice", async (userId) => {
      read.push(userId);
      return userId === "alice" ? TOKEN_A : TOKEN_B;
    });
    expect(token).toBe(TOKEN_A);
    expect(read).toEqual(["alice"]);
    expect(token).not.toBe(TOKEN_B);
  });

  test("a Claude thread uses its creator's token, and nobody else's", async () => {
    const read: string[] = [];
    const token = await claudeTokenForRun(
      { agentBackend: "claude", createdBy: "alice" },
      async (userId) => {
        read.push(userId);
        if (userId === "alice") return TOKEN_A;
        if (userId === "bob") return TOKEN_B;
        return undefined;
      },
    );
    expect(token).toBe(TOKEN_A);
    expect(read).toEqual(["alice"]);
  });

  test("a native thread does not read anyone's token", async () => {
    const read: string[] = [];
    const token = await claudeTokenForRun(
      { agentBackend: "native", createdBy: "alice" },
      async (userId) => {
        read.push(userId);
        return TOKEN_A;
      },
    );
    expect(token).toBeUndefined();
    expect(read).toEqual([]);
  });

  test("a Claude thread with no token fails before a run can start", async () => {
    const missing = claudeTokenForRun(
      { agentBackend: "claude", createdBy: "alice" },
      async () => undefined,
    );
    await expect(missing).rejects.toBeInstanceOf(ClaudeTokenMissingError);
    await expect(missing).rejects.toThrow(CLAUDE_TOKEN_MISSING);
  });
});
