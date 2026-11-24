import { afterEach, describe, expect, test } from "bun:test";

import { CLOUD_OFF } from "./cloud-config";
import { RuntimeOfflineError } from "./offline";
import { EXPIRED_COMPUTER, createSandboxRuntime } from "./runtime";
import { setSandboxSettings } from "./settings";
import type { SandboxRunner, SandboxStore } from "./types";
import type { RuntimeProviderKind } from "@aven/protocol/types";

const connection: SandboxRunner = { call: async () => ({}) };

afterEach(() => setSandboxSettings(null));

function store(overrides: Partial<SandboxStore> = {}): SandboxStore {
  return {
    record: async () => null,
    saveSandboxId: async () => undefined,
    providerOf: async () => undefined,
    isExpiredCloud: async () => false,
    ...overrides,
  };
}

function unreachable(message: string) {
  return new RuntimeOfflineError(message);
}

describe("reaching a runtime's sandbox", () => {
  test("uses a connected runner without asking which provider it is", async () => {
    let asked = false;
    const sandbox = createSandboxRuntime<SandboxRunner>(
      store({
        providerOf: async () => {
          asked = true;
          return undefined;
        },
      }),
    );

    expect(await sandbox.reachRunner({ get: () => connection }, { runtimeId: "r1" })).toBe(
      connection,
    );
    expect(asked).toBe(false);
  });

  test("says a runtime whose sandbox was deleted after 48 hours is gone", async () => {
    const sandbox = createSandboxRuntime<SandboxRunner>(
      store({ isExpiredCloud: async () => true }),
    );

    await expect(
      sandbox.reachRunner({ get: () => undefined }, { runtimeId: "r1" }),
    ).rejects.toThrow(new RuntimeOfflineError(EXPIRED_COMPUTER));
  });

  test("never starts a runner nobody recorded, and says what the caller asked it to say", async () => {
    const sandbox = createSandboxRuntime<SandboxRunner>(store());

    await expect(
      sandbox.reachRunner({ get: () => undefined }, { runtimeId: "r1", threadId: "t1" }),
    ).rejects.toThrow(unreachable("The runtime for this project is offline"));

    await expect(
      sandbox.reachRunner(
        { get: () => undefined },
        { runtimeId: "r1", threadId: "t1" },
        "The bot's computer is offline",
      ),
    ).rejects.toThrow(new RuntimeOfflineError("The bot's computer is offline"));
  });

  test("a manual runtime that is not connected is offline", async () => {
    const sandbox = createSandboxRuntime<SandboxRunner>(
      store({ providerOf: async () => "manual" }),
    );

    await expect(
      sandbox.reachRunner({ get: () => undefined }, { runtimeId: "r1" }),
    ).rejects.toBeInstanceOf(RuntimeOfflineError);
  });

  test("a cloud provider this server does not offer cannot wake its sandbox", async () => {
    setSandboxSettings(null);
    const sandbox = createSandboxRuntime<SandboxRunner>(store({ providerOf: async () => "boat" }));

    await expect(
      sandbox.reachRunner({ get: () => undefined }, { runtimeId: "r1" }),
    ).rejects.toThrow(CLOUD_OFF);
  });

  test("a cloud computer is admitted before it is started, and a refusal stops the start", async () => {
    setSandboxSettings({ provider: "boat", base: "", apiKey: "boat_key", runnerUrl: "" });
    const recorded: string[] = [];
    const sandbox = createSandboxRuntime<SandboxRunner>(
      store({
        providerOf: async () => "boat",
        record: async ({ runtimeId }) => {
          recorded.push(runtimeId);
          return null;
        },
        admit: async () => {
          throw new Error("Not now");
        },
      }),
    );

    await expect(
      sandbox.reachRunner({ get: () => undefined }, { runtimeId: "r1" }),
    ).rejects.toThrow("Not now");
    expect(recorded).toEqual([]);
  });

  test("notifies onStartFailed when starting a cloud sandbox fails", async () => {
    setSandboxSettings({ provider: "boat", base: "", apiKey: "boat_key", runnerUrl: "" });
    const failed: string[] = [];
    const sandbox = createSandboxRuntime<SandboxRunner>(
      store({
        providerOf: async () => "boat",
        record: async () => null,
        onStartFailed: async (runtimeId) => {
          failed.push(runtimeId);
        },
      }),
    );

    await expect(
      sandbox.reachRunner({ get: () => undefined }, { runtimeId: "r1" }),
    ).rejects.toBeInstanceOf(RuntimeOfflineError);
    expect(failed).toEqual(["r1"]);
  });

  test("a manual runtime is never put through admission", async () => {
    let asked = false;
    const sandbox = createSandboxRuntime<SandboxRunner>(
      store({
        providerOf: async () => "manual",
        admit: async () => {
          asked = true;
        },
      }),
    );

    await expect(
      sandbox.reachRunner({ get: () => undefined }, { runtimeId: "r1" }),
    ).rejects.toBeInstanceOf(RuntimeOfflineError);
    expect(asked).toBe(false);
  });

  test("a thread on a runtime nobody recorded has no runner to ask to free it", async () => {
    const asked: string[] = [];
    const sandbox = createSandboxRuntime<SandboxRunner>(store());

    await sandbox.releaseThread(
      {
        get: (id: string) => {
          asked.push(id);
          return connection;
        },
      },
      { runtimeId: "r1", threadId: "t1" },
    );

    expect(asked).toEqual([]);
  });

  test("stopping a runtime asks each provider, revoked included, for its sandbox", async () => {
    const asked: { provider: RuntimeProviderKind; revoked?: boolean }[] = [];
    const sandbox = createSandboxRuntime<SandboxRunner>(
      store({
        record: async (input) => {
          asked.push({ provider: input.provider, revoked: input.revoked });
          return null;
        },
      }),
    );

    await sandbox.stopCloudRuntime("r1");

    expect(asked).toEqual([
      { provider: "boat", revoked: true },
      { provider: "spaces", revoked: true },
      { provider: "lizard", revoked: true },
      { provider: "sprites", revoked: true },
    ]);
  });
});
