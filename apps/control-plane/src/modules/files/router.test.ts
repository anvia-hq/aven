import { afterAll, describe, expect, test } from "bun:test";

import { answerCalls, runnerRig } from "../../testing/runner-rig";
import { filesRouter } from "./router";

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("a thread's files (real postgres, real WebSocket)", async () => {
  const rig = await runnerRig(filesRouter);
  const { base, owner, outsider } = rig;
  afterAll(() => rig.stop());

  async function setup(
    answer: (call: [string, unknown]) => { ok: boolean; result?: unknown; error?: string },
  ) {
    const calls: unknown[] = [];
    const { thread } = await rig.threadOnRunner(
      answerCalls(
        (method) => method.startsWith("files."),
        (method, params) => {
          calls.push([method, params]);
          return answer([method, params]);
        },
      ),
    );
    return { thread, calls };
  }

  const get = (path: string, token: string | undefined) =>
    fetch(`http://${base}${path}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });

  test("asks the runner for a folder and for a file", async () => {
    const { thread, calls } = await setup(([method]) => ({
      ok: true,
      result:
        method === "files.list"
          ? { entries: [{ name: "a.ts", type: "file" }] }
          : { kind: "text", text: "hi\n", size: 3, truncated: false },
    }));
    const folder = await get(`/threads/${thread.id}/files?path=src`, owner.token);
    expect(await folder.json()).toEqual({
      available: true,
      entries: [{ name: "a.ts", type: "file" }],
    });
    const file = await get(`/threads/${thread.id}/files/content?path=src%2Fa.ts`, owner.token);
    expect(await file.json()).toEqual({
      available: true,
      kind: "text",
      text: "hi\n",
      size: 3,
      truncated: false,
    });
    await get(`/threads/${thread.id}/files`, owner.token);
    expect(calls).toEqual([
      ["files.list", { threadId: thread.id, path: "src" }],
      ["files.read", { threadId: thread.id, path: "src/a.ts" }],
      ["files.list", { threadId: thread.id, path: "" }],
    ]);
  });

  test("searches the workspace for the composer's @", async () => {
    const { thread, calls } = await setup(() => ({
      ok: true,
      result: { paths: ["src/app.ts", "app.config.ts"] },
    }));
    const found = await get(`/threads/${thread.id}/files/search?q=app`, owner.token);
    expect(await found.json()).toEqual({ available: true, paths: ["src/app.ts", "app.config.ts"] });
    await get(`/threads/${thread.id}/files/search`, owner.token);
    expect(calls).toEqual([
      ["files.search", { threadId: thread.id, query: "app" }],
      ["files.search", { threadId: thread.id, query: "" }],
    ]);
  });

  test("says so when the thread has no workspace yet", async () => {
    const { thread } = await setup(() => ({ ok: true, result: null }));
    const response = await get(`/threads/${thread.id}/files`, owner.token);
    expect(await response.json()).toEqual({ available: false });
  });

  test("hides a runtime's own error and an answer it should not give", async () => {
    const failing = await setup(() => ({ ok: false, error: "EACCES /home/x/secret" }));
    const failed = await get(`/threads/${failing.thread.id}/files`, owner.token);
    expect(failed.status).toBe(503);
    expect(await failed.text()).not.toContain("secret");

    const odd = await setup(() => ({ ok: true, result: { entries: [{ name: 3 }] } }));
    expect((await get(`/threads/${odd.thread.id}/files`, owner.token)).status).toBe(503);
  });

  test("refuses a stranger, another organization and a malformed path", async () => {
    const { thread, calls } = await setup(() => ({ ok: true, result: { entries: [] } }));
    expect((await get(`/threads/${thread.id}/files`, undefined)).status).toBe(401);
    expect((await get(`/threads/${thread.id}/files`, outsider.token)).status).toBe(404);
    expect((await get(`/threads/${thread.id}/files?path=a%00b`, owner.token)).status).toBe(422);
    expect(calls).toEqual([]);
  });
});
