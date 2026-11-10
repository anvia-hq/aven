import { afterEach, describe, expect, spyOn, test } from "bun:test";

import { codexLogin, NO_CODEX } from "./codex-login";
import type { RuntimeHub } from "./hub";
import { LOCAL_RUNTIME_ID, runtimesService } from "./service";

type Call = { method: string; params: unknown };

function hubOf(runner: { codex: boolean; reply?: unknown } | undefined) {
  const calls: Call[] = [];
  const hub = {
    get: () =>
      runner && {
        codex: runner.codex,
        call: async (method: string, params: unknown) => {
          calls.push({ method, params });
          return runner.reply;
        },
      },
  } as unknown as RuntimeHub;
  return { hub, calls };
}

const runtimeOf = (id: string, ownerId: string | null) =>
  spyOn(runtimesService, "get").mockResolvedValue({ id, ownerId } as never);

afterEach(() => {
  delete process.env.AVEN_BUILTIN_RUNNER_OWNER;
});

describe("signing in to Codex on a runner", () => {
  test("the runner's owner asks the runner, and gets what it says", async () => {
    const get = runtimeOf("rt-1", "ada");
    const { hub, calls } = hubOf({
      codex: true,
      reply: { state: "waiting", url: "https://auth.openai.com/codex/device", code: "AOL5-C2T9O" },
    });
    expect(await codexLogin(hub, "org-1", "ada", "rt-1", "start")).toEqual({
      state: "waiting",
      url: "https://auth.openai.com/codex/device",
      code: "AOL5-C2T9O",
    });
    expect(calls).toEqual([{ method: "codex.login", params: { action: "start" } }]);
    get.mockRestore();
  });

  test("anyone else, an owner or admin included, is refused, and the runner is not asked", async () => {
    const get = runtimeOf("rt-1", "grace");
    const { hub, calls } = hubOf({ codex: true, reply: { state: "signed-out" } });
    await expect(codexLogin(hub, "org-1", "ada", "rt-1", "status")).rejects.toThrow(
      "Only the runner's owner",
    );
    expect(calls).toEqual([]);
    get.mockRestore();
  });

  test("the built-in runner is anyone's only when the operator named its owner", async () => {
    const get = runtimeOf(LOCAL_RUNTIME_ID, null);
    const { hub } = hubOf({ codex: true, reply: { state: "signed-out" } });
    await expect(codexLogin(hub, "org-1", "ada", LOCAL_RUNTIME_ID, "status")).rejects.toThrow(
      "Only the runner's owner",
    );
    process.env.AVEN_BUILTIN_RUNNER_OWNER = "ada";
    expect(await codexLogin(hub, "org-1", "ada", LOCAL_RUNTIME_ID, "status")).toEqual({
      state: "signed-out",
    });
    get.mockRestore();
  });

  test("an offline runner, and a runner that has not said it can run Codex, are told apart", async () => {
    const get = runtimeOf("rt-1", "ada");
    await expect(
      codexLogin(hubOf(undefined).hub, "org-1", "ada", "rt-1", "status"),
    ).rejects.toThrow("offline");
    const { hub, calls } = hubOf({ codex: false });
    expect(await codexLogin(hub, "org-1", "ada", "rt-1", "status")).toEqual({
      state: "unavailable",
      error: NO_CODEX,
    });
    expect(calls).toEqual([]);
    get.mockRestore();
  });

  test("an answer the control plane cannot read is an error, not passed on", async () => {
    const get = runtimeOf("rt-1", "ada");
    const { hub } = hubOf({ codex: true, reply: { state: "something else" } });
    await expect(codexLogin(hub, "org-1", "ada", "rt-1", "status")).rejects.toThrow(
      "did not answer",
    );
    get.mockRestore();
  });

  test("a runtime that is not there is not found", async () => {
    const get = spyOn(runtimesService, "get").mockResolvedValue(null);
    await expect(
      codexLogin(hubOf({ codex: true }).hub, "org-1", "ada", "rt-9", "status"),
    ).rejects.toThrow("Runtime not found");
    get.mockRestore();
  });
});
