import { describe, expect, test } from "bun:test";

import { UnavailableError } from "../../errors";
import { createBrowserService } from "./service";
import { verifyBrowserToken } from "./token";

const secret = new TextEncoder().encode("secret");

describe("opening the Browser", () => {
  test("gives a URL on the browser origin with a ticket for the thread and the port", async () => {
    const seen: unknown[] = [];
    const service = createBrowserService({
      origin: "https://host.example:8444",
      secret,
      readable: async (viewer, threadId) => void seen.push({ viewer, threadId }),
    });
    const { url } = await service.open("org", "user", "thread", 3000);
    const parsed = new URL(url);
    expect(parsed.origin).toBe("https://host.example:8444");
    expect(parsed.pathname).toBe("/__aven/enter");
    expect(verifyBrowserToken(secret, "ticket", parsed.searchParams.get("ticket")!)).toEqual({
      organizationId: "org",
      threadId: "thread",
      port: 3000,
    });
    expect(seen).toEqual([
      { viewer: { organizationId: "org", userId: "user" }, threadId: "thread" },
    ]);
  });

  test("gives nothing for a thread the person may not read", async () => {
    const service = createBrowserService({
      origin: "https://host.example:8444",
      secret,
      readable: async () => {
        throw new Error("not found");
      },
    });
    await expect(service.open("org", "user", "thread", 3000)).rejects.toThrow("not found");
  });

  test("says what to set when the server has no browser origin", async () => {
    const service = createBrowserService({ origin: undefined, secret, readable: async () => null });
    const error = await service.open("org", "user", "thread", 3000).catch((caught) => caught);
    expect(error).toBeInstanceOf(UnavailableError);
    expect(error.message).toContain("AVEN_BROWSER_ORIGIN");
  });
});
