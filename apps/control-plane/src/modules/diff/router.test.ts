import { afterAll, describe, expect, test } from "bun:test";

import { answerCalls, runnerRig } from "../../testing/runner-rig";
import { diffRouter } from "./router";

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("a thread's changes (real postgres, real WebSocket)", async () => {
  const rig = await runnerRig(diffRouter);
  const { base, owner, outsider } = rig;
  afterAll(() => rig.stop());

  async function setup(
    answer: (params: unknown) => { ok: boolean; result?: unknown; error?: string },
  ) {
    const calls: unknown[] = [];
    const { thread } = await rig.threadOnRunner(
      answerCalls(
        (method) => method === "diff.get",
        (_method, params) => {
          calls.push(params);
          return answer(params);
        },
      ),
    );
    return { thread, calls };
  }

  const get = (path: string, token: string | undefined) =>
    fetch(`http://${base}${path}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });

  test("asks the runner for the scope and returns its patch", async () => {
    const { thread, calls } = await setup(() => ({
      ok: true,
      result: { patch: "diff --git a/x b/x\n", truncated: false },
    }));
    const turn = await get(`/threads/${thread.id}/diff`, owner.token);
    expect(turn.status).toBe(200);
    expect(await turn.json()).toEqual({
      available: true,
      patch: "diff --git a/x b/x\n",
      truncated: false,
    });
    await get(`/threads/${thread.id}/diff?scope=all`, owner.token);
    expect(calls).toEqual([
      { threadId: thread.id, scope: "turn" },
      { threadId: thread.id, scope: "all" },
    ]);
  });

  test("says so when the thread has no workspace yet", async () => {
    const { thread } = await setup(() => ({ ok: true, result: null }));
    const response = await get(`/threads/${thread.id}/diff`, owner.token);
    expect(await response.json()).toEqual({ available: false });
  });

  test("hides a runtime's own error and an answer it should not give", async () => {
    const failing = await setup(() => ({ ok: false, error: "fatal: secret path /home/x" }));
    const failed = await get(`/threads/${failing.thread.id}/diff`, owner.token);
    expect(failed.status).toBe(503);
    expect(await failed.text()).not.toContain("secret");

    const odd = await setup(() => ({ ok: true, result: { patch: 3 } }));
    expect((await get(`/threads/${odd.thread.id}/diff`, owner.token)).status).toBe(503);
  });

  test("refuses a stranger, another organization and an unknown scope", async () => {
    const { thread, calls } = await setup(() => ({
      ok: true,
      result: { patch: "", truncated: false },
    }));
    expect((await get(`/threads/${thread.id}/diff`, undefined)).status).toBe(401);
    expect((await get(`/threads/${thread.id}/diff`, outsider.token)).status).toBe(404);
    expect((await get(`/threads/${thread.id}/diff?scope=everything`, owner.token)).status).toBe(
      422,
    );
    expect(calls).toEqual([]);
  });
});
