import { describe, expect, test } from "bun:test";

import { BoatApiError, BoatClient } from "./client";
import { removeBoatSandbox } from "./stop";

const ID = "bx_23456789";

function client(reply: () => Response, calls: { authorization?: string } = {}) {
  const fetchFn = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    calls.authorization = (init?.headers as Record<string, string> | undefined)?.Authorization;
    return reply();
  }) as typeof fetch;

  return new BoatClient(fetchFn, "https://boat.test/api/v1");
}

function withKey(key: string | undefined, run: () => Promise<void>) {
  const kept = process.env.AVEN_BOAT_API_KEY;

  if (key === undefined) delete process.env.AVEN_BOAT_API_KEY;
  else process.env.AVEN_BOAT_API_KEY = key;

  return run().finally(() => {
    if (kept === undefined) delete process.env.AVEN_BOAT_API_KEY;
    else process.env.AVEN_BOAT_API_KEY = kept;
  });
}

describe("deleting the sandbox of an expired Aven Cloud computer", () => {
  test("deletes it with the boat key, and counts one that is already gone as deleted", async () => {
    const calls: { authorization?: string } = {};

    await withKey("boat_lifecycle_key", async () => {
      expect(
        await removeBoatSandbox(
          ID,
          client(() => Response.json({ ok: true }), calls),
        ),
      ).toBe(true);
      expect(
        await removeBoatSandbox(
          ID,
          client(() => Response.json({}, { status: 404 })),
        ),
      ).toBe(true);
    });

    expect(calls.authorization).toBe("Bearer boat_lifecycle_key");
  });

  test("a boat that will not delete is tried again, and no key is nothing to do", async () => {
    const failing = client(() =>
      Response.json({ ok: false, code: "bad_gateway", message: "Boat is down" }, { status: 502 }),
    );

    await withKey("boat_lifecycle_key", async () => {
      await expect(removeBoatSandbox(ID, failing)).rejects.toBeInstanceOf(BoatApiError);
    });

    await withKey(undefined, async () => {
      expect(
        await removeBoatSandbox(
          ID,
          client(() => Response.json({ ok: true })),
        ),
      ).toBe(false);
    });
  });
});
