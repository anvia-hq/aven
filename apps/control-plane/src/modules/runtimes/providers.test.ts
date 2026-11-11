import { describe, expect, test } from "bun:test";

import { RuntimeOfflineError, type RuntimeConnection } from "./hub";
import { reachRunner } from "./providers";

const connection = { closed: false } as unknown as RuntimeConnection;
const nothingConnected = { get: () => undefined };

describe("reaching a runtime's runner", () => {
  test("uses the runner that is connected without asking for its provider", async () => {
    const hub = { get: (id: string) => (id === "r1" ? connection : undefined) };
    const providerOf = () => Promise.reject(new Error("the provider was looked up"));

    expect(await reachRunner(hub, { runtimeId: "r1" }, undefined, providerOf)).toBe(connection);
  });

  test("cannot start a manual runner that is not connected, and says why", async () => {
    const manual = async () => "manual" as const;

    await expect(
      reachRunner(nothingConnected, { runtimeId: "r1", threadId: "t1" }, undefined, manual),
    ).rejects.toThrow(new RuntimeOfflineError("The runtime for this project is offline"));
    await expect(
      reachRunner(
        nothingConnected,
        { runtimeId: "r1", threadId: "t1" },
        "The bot's computer is offline",
        manual,
      ),
    ).rejects.toThrow(new RuntimeOfflineError("The bot's computer is offline"));
  });

  test("treats a revoked or missing runtime as offline", async () => {
    await expect(
      reachRunner(
        nothingConnected,
        { runtimeId: "r1", threadId: "t1" },
        undefined,
        async () => undefined,
      ),
    ).rejects.toBeInstanceOf(RuntimeOfflineError);
  });
});
