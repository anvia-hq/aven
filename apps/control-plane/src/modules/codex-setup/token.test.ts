import { describe, expect, test } from "bun:test";

import { CODEX_TOKEN_MISSING } from "@aven/protocol/runtime-wire";

import { CodexTokenMissingError, codexTokenOf } from "./token";

const TOKEN_A = "sk-codex-token-for-alice-0001";
const TOKEN_B = "sk-codex-token-for-bob-000002";

describe("a Codex API key belongs to the thread's owner", () => {
  test("reads only the owner it is asked for", async () => {
    const read: string[] = [];
    const token = await codexTokenOf("alice", async (userId) => {
      read.push(userId);
      return userId === "alice" ? TOKEN_A : TOKEN_B;
    });
    expect(token).toBe(TOKEN_A);
    expect(read).toEqual(["alice"]);
    expect(token).not.toBe(TOKEN_B);
  });

  test("an owner with no key fails before a run can start", async () => {
    const missing = codexTokenOf("alice", async () => undefined);
    await expect(missing).rejects.toBeInstanceOf(CodexTokenMissingError);
    await expect(missing).rejects.toThrow(CODEX_TOKEN_MISSING);
  });
});
