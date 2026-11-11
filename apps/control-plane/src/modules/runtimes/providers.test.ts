import { describe, expect, test } from "bun:test";

import { RuntimeOfflineError, type RuntimeConnection } from "./hub";
import { manualProvider } from "./providers";

describe("the manual runtime provider", () => {
  test("reaches a runner that is connected", async () => {
    const connection = { closed: false } as unknown as RuntimeConnection;
    const provider = manualProvider({ get: (id) => (id === "r1" ? connection : undefined) });

    expect(await provider.reach("r1")).toBe(connection);
  });

  test("cannot start a runner that is not connected, and says why", async () => {
    const provider = manualProvider({ get: () => undefined });

    await expect(provider.reach("r1")).rejects.toThrow(
      new RuntimeOfflineError("The runtime for this project is offline"),
    );
    await expect(provider.reach("r1", "The bot's computer is offline")).rejects.toThrow(
      new RuntimeOfflineError("The bot's computer is offline"),
    );
  });
});
