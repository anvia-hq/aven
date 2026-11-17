import { describe, expect, test } from "bun:test";

import { answerRuntimeCall } from "./runtime-calls";
import type { CallRun, RuntimeCallContext } from "./types";

function context(thread: CallRun["thread"]): RuntimeCallContext {
  return {
    runtimeId: "11111111-1111-4111-8111-111111111111",
    forks: {} as RuntimeCallContext["forks"],
    machines: {} as RuntimeCallContext["machines"],
    findRun: (runId) => (runId === "run-1" ? ({ thread } as CallRun) : undefined),
    findBotReply: () => undefined,
    store: {} as RuntimeCallContext["store"],
    repoAccess: async () => ({ cloneUrl: "", defaultBranch: "main", token: "" }),
    folderOf: async () => null,
    skillArchive: async () => undefined,
    mcpReport: async () => undefined,
  };
}

const run = { runId: "run-1" };
const withDb = process.env.DATABASE_URL ? test : test.skip;

describe("a run's environment", () => {
  test("a run on the person's own computer has none, and says so", async () => {
    const onComputer = context({ id: "t1", organizationId: "o1", projectId: "p1" });

    await expect(
      answerRuntimeCall("environment.save", { ...run, setupDigest: "a".repeat(64) }, onComputer),
    ).rejects.toThrow("This run is not on an Aven Cloud computer");
    expect(await answerRuntimeCall("environment.read", run, onComputer)).toBeNull();
  });

  withDb("a run whose runtime is not a live Aven Cloud sandbox cannot keep one", async () => {
    const onSandbox = context({
      id: "t2",
      organizationId: "o1",
      projectId: "p1",
      provider: "boat",
    });

    await expect(
      answerRuntimeCall("environment.save", { ...run, setupDigest: "a".repeat(64) }, onSandbox),
    ).rejects.toThrow("This run is not on an Aven Cloud computer");
  });

  test("a setup digest that is not one is refused before anything else", async () => {
    const onSandbox = context({
      id: "t3",
      organizationId: "o1",
      projectId: "p1",
      provider: "boat",
    });

    await expect(
      answerRuntimeCall("environment.save", { ...run, setupDigest: "not-a-digest" }, onSandbox),
    ).rejects.toThrow("Invalid parameters");
  });
});
