import { describe, expect, test } from "bun:test";

import type { RuntimeHub } from "../runtimes/hub";
import type { ProviderOf } from "../runtimes/types";
import { createPutAwayThread } from "./put-away";

const thread = { id: "t-1", runtimeId: "r-1" };
const manual: ProviderOf = async () => "manual";
const settled = () => Bun.sleep(0);

function harness({ connected = true } = {}) {
  const calls: { method: string; params: unknown }[] = [];
  const hub = {
    get: (id: string) =>
      connected && id === thread.runtimeId
        ? {
            call: async (method: string, params: unknown) => {
              calls.push({ method, params });
              return { released: true };
            },
          }
        : undefined,
  } as unknown as Pick<RuntimeHub, "get">;
  return { calls, hub };
}

describe("putting a thread away", () => {
  test("stops the run and asks the thread's runner to free its sandbox", async () => {
    const { calls, hub } = harness();
    const cancelled: string[] = [];
    const putAway = createPutAwayThread({
      cancel: (id) => cancelled.push(id),
      hub,
      providerOf: manual,
    });

    putAway(thread);
    await settled();

    expect(cancelled).toEqual([thread.id]);
    expect(calls).toEqual([{ method: "sandbox.release", params: { threadId: thread.id } }]);
  });

  test("a runner that is away has nothing to free, and the run is stopped all the same", async () => {
    const { calls, hub } = harness({ connected: false });
    const cancelled: string[] = [];
    const putAway = createPutAwayThread({
      cancel: (id) => cancelled.push(id),
      hub,
      providerOf: manual,
    });

    putAway(thread);
    await settled();

    expect(cancelled).toEqual([thread.id]);
    expect(calls).toEqual([]);
  });

  test("a runtime that is revoked or gone has no runner to ask", async () => {
    const { calls, hub } = harness();
    const cancelled: string[] = [];
    const putAway = createPutAwayThread({
      cancel: (id) => cancelled.push(id),
      hub,
      providerOf: async () => undefined,
    });

    putAway(thread);
    await settled();

    expect(cancelled).toEqual([thread.id]);
    expect(calls).toEqual([]);
  });
});
