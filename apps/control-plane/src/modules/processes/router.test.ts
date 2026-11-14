import { afterAll, describe, expect, test } from "bun:test";

import { answerCalls, runnerRig } from "../../testing/runner-rig";
import { processesRouter } from "./router";

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("a thread's background processes (real postgres, real WebSocket)", async () => {
  const rig = await runnerRig(processesRouter);
  const { base, owner, outsider } = rig;
  afterAll(() => rig.stop());

  async function setup(
    answer: (method: string, params: unknown) => { ok: boolean; result?: unknown; error?: string },
  ) {
    const calls: { method: string; params: unknown }[] = [];
    const { thread } = await rig.threadOnRunner(
      answerCalls(
        (method) => method.startsWith("processes."),
        (method, params) => {
          calls.push({ method, params });
          return answer(method, params);
        },
      ),
    );
    return { thread, calls };
  }

  const send = (method: "GET" | "POST", path: string, token: string | undefined) =>
    fetch(`http://${base}${path}`, {
      method,
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
  const get = (path: string, token: string | undefined) => send("GET", path, token);
  const post = (path: string, token: string | undefined) => send("POST", path, token);

  const running = {
    id: "p1",
    command: "npm run dev",
    status: "running",
    startedAt: "2026-11-01T10:00:00.000Z",
  };

  test("lists the thread's processes, reads their output and stops one, through the runner", async () => {
    const { thread, calls } = await setup((method) => {
      if (method === "processes.logs")
        return { ok: true, result: { stdout: "ready\n", stderr: "", truncated: false } };

      const status = method === "processes.stop" ? "stopped" : "running";
      return { ok: true, result: { processes: [{ ...running, status }] } };
    });

    const listed = await get(`/threads/${thread.id}/processes`, owner.token);
    expect(listed.status).toBe(200);
    expect(await listed.json()).toEqual({ processes: [running] });

    const logs = await get(`/threads/${thread.id}/processes/p1/logs`, owner.token);
    expect(await logs.json()).toEqual({ stdout: "ready\n", stderr: "", truncated: false });

    const stopped = await post(`/threads/${thread.id}/processes/p1/stop`, owner.token);
    expect(await stopped.json()).toEqual({ processes: [{ ...running, status: "stopped" }] });

    expect(calls).toEqual([
      { method: "processes.list", params: { threadId: thread.id } },
      { method: "processes.logs", params: { threadId: thread.id, processId: "p1" } },
      { method: "processes.stop", params: { threadId: thread.id, processId: "p1" } },
    ]);
  });

  test("hides a runtime's own error and an answer it should not give", async () => {
    const failing = await setup(() => ({ ok: false, error: "docker: secret path /home/x" }));
    for (const response of [
      await get(`/threads/${failing.thread.id}/processes`, owner.token),
      await post(`/threads/${failing.thread.id}/processes/p1/stop`, owner.token),
      await get(`/threads/${failing.thread.id}/processes/p1/logs`, owner.token),
    ]) {
      expect(response.status).toBe(503);
      expect(await response.text()).not.toContain("secret");
    }

    const odd = await setup(() => ({ ok: true, result: { processes: [{ id: 3 }] } }));
    expect((await get(`/threads/${odd.thread.id}/processes`, owner.token)).status).toBe(503);
  });

  test("refuses a stranger and another organization, stopping nothing", async () => {
    const { thread, calls } = await setup(() => ({ ok: true, result: { processes: [] } }));
    const stop = `/threads/${thread.id}/processes/p1/stop`;

    expect((await get(`/threads/${thread.id}/processes`, undefined)).status).toBe(401);
    expect((await post(stop, undefined)).status).toBe(401);
    expect((await get(`/threads/${thread.id}/processes`, outsider.token)).status).toBe(404);
    expect((await post(stop, outsider.token)).status).toBe(404);
    expect((await get(`/threads/${thread.id}/processes/p1/logs`, outsider.token)).status).toBe(404);
    expect(calls).toEqual([]);
  });
});
