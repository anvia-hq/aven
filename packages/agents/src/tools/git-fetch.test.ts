import { describe, expect, test } from "bun:test";

import { createGitFetchTool, type FetchRemote } from "./git-fetch";

const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);

// A fetch that answers with `answer` and records the branches it was asked for.
function setup(answer: { branch: string; commit: string; previous: string | null }) {
  const asked: (string | undefined)[] = [];
  const fetchRemote: FetchRemote = async (branch) => {
    asked.push(branch);
    return answer;
  };
  return { tool: createGitFetchTool(fetchRemote), asked };
}

describe("git_fetch", () => {
  test("asks for the default branch when none is named, and says what moved", async () => {
    const { tool, asked } = setup({ branch: "main", commit: SHA_B, previous: SHA_A });

    expect(await tool.call({})).toEqual({
      ref: "origin/main",
      commit: SHA_B,
      updated: true,
      summary: "origin/main is now at bbbbbbb (was aaaaaaa).",
    });
    expect(asked).toEqual([undefined]);
  });

  test("passes the branch the agent named", async () => {
    const { tool, asked } = setup({ branch: "feature/x", commit: SHA_A, previous: null });

    const result = await tool.call({ branch: "feature/x" });

    expect(asked).toEqual(["feature/x"]);
    expect(result).toMatchObject({ ref: "origin/feature/x", updated: true });
    expect(result.summary).toBe("origin/feature/x is now at aaaaaaa.");
  });

  test("says when there was nothing new", async () => {
    const { tool } = setup({ branch: "main", commit: SHA_A, previous: SHA_A });

    const result = await tool.call({});

    expect(result).toMatchObject({ updated: false });
    expect(result.summary).toBe("origin/main was already up to date at aaaaaaa.");
  });

  test("a fetch that fails is the tool's error, in the runner's words", async () => {
    const tool = createGitFetchTool(async () => {
      throw new Error("Could not fetch nope: couldn't find remote ref refs/heads/nope");
    });

    await expect(tool.call({ branch: "nope" })).rejects.toThrow("Could not fetch nope");
  });
});
