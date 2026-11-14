import { describe, expect, test } from "bun:test";

import { CLAUDE_TOKEN_MISSING } from "@aven/protocol/runtime-wire";

import { ClaudeTokenMissingError, claudeTokenOf } from "./token";

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

  test("an owner with no token fails before a run can start", async () => {
    const missing = claudeTokenOf("alice", async () => undefined);
    await expect(missing).rejects.toBeInstanceOf(ClaudeTokenMissingError);
    await expect(missing).rejects.toThrow(CLAUDE_TOKEN_MISSING);
  });
});
