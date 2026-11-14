import { afterAll, describe, expect, test } from "bun:test";

import { answerCalls, runnerRig } from "../../testing/runner-rig";
import { artifactsRouter } from "./router";

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("the images a thread's agent showed (real postgres, real WebSocket)", async () => {
  const rig = await runnerRig(artifactsRouter);
  const { base, owner, outsider } = rig;
  afterAll(() => rig.stop());

  async function setup(
    answer: (params: unknown) => { ok: boolean; result?: unknown; error?: string },
  ) {
    const calls: unknown[] = [];
    const { thread } = await rig.threadOnRunner(
      answerCalls(
        (method) => method === "artifacts.read",
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
  const name = "00000000-0000-4000-8000-000000000001.png";

  test("serves the image the runner keeps, as its bytes", async () => {
    const { thread, calls } = await setup(() => ({
      ok: true,
      result: { mediaType: "image/png", data: "AQID" },
    }));
    const response = await get(`/threads/${thread.id}/artifacts/${name}`, owner.token);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(calls).toEqual([{ threadId: thread.id, name }]);
  });

  test("serves an HTML page sandboxed, with the bridge, and never in pieces", async () => {
    const page = "<!doctype html><html><head></head><body>hi</body></html>";
    const { thread } = await setup(() => ({
      ok: true,
      result: { mediaType: "text/html", data: Buffer.from(page).toString("base64") },
    }));
    const htmlName = "00000000-0000-4000-8000-000000000002.html";
    const response = await fetch(`http://${base}/threads/${thread.id}/artifacts/${htmlName}`, {
      headers: { authorization: `Bearer ${owner.token}`, range: "bytes=0-3" },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toStartWith("text/html");
    expect(response.headers.get("content-security-policy")).toContain("sandbox allow-scripts");
    const body = await response.text();
    expect(body).toContain("<script>");
    expect(body).toContain("<body>hi</body>");
  });

  test("is not found when the runner has no such image", async () => {
    const { thread } = await setup(() => ({ ok: true, result: null }));
    expect((await get(`/threads/${thread.id}/artifacts/${name}`, owner.token)).status).toBe(404);
  });

  test("hides a runtime's own error and refuses an image type it should not send", async () => {
    const failing = await setup(() => ({ ok: false, error: "EACCES /home/x/secret" }));
    const failed = await get(`/threads/${failing.thread.id}/artifacts/${name}`, owner.token);
    expect(failed.status).toBe(503);
    expect(await failed.text()).not.toContain("secret");

    const svg = await setup(() => ({ ok: true, result: { mediaType: "image/svg+xml", data: "" } }));
    const odd = await get(`/threads/${svg.thread.id}/artifacts/${name}`, owner.token);
    expect(odd.status).toBe(503);
  });

  test("refuses a stranger, another organization and a name a runner does not give", async () => {
    const { thread, calls } = await setup(() => ({ ok: true, result: null }));
    const path = `/threads/${thread.id}/artifacts/${name}`;
    expect((await get(path, undefined)).status).toBe(401);
    expect((await get(path, outsider.token)).status).toBe(404);
    const traversal = `/threads/${thread.id}/artifacts/..%2F..%2Fruns.db`;
    expect((await get(traversal, owner.token)).status).toBe(422);
    expect((await get(`/threads/${thread.id}/artifacts/a.svg`, owner.token)).status).toBe(422);
    expect(calls).toEqual([]);
  });

  test("serves a video in pieces, as a browser asks for it, and refuses a range outside it", async () => {
    const video = "00000000-0000-4000-8000-000000000002.mp4";
    const { thread } = await setup(() => ({
      ok: true,
      result: { mediaType: "video/mp4", data: Buffer.from("0123456789").toString("base64") },
    }));
    const path = `/threads/${thread.id}/artifacts/${video}`;
    const piece = await fetch(`http://${base}${path}`, {
      headers: { authorization: `Bearer ${owner.token}`, range: "bytes=2-5" },
    });
    expect(piece.status).toBe(206);
    expect(piece.headers.get("content-range")).toBe("bytes 2-5/10");
    expect(piece.headers.get("content-type")).toBe("video/mp4");
    expect(await piece.text()).toBe("2345");

    const whole = await get(path, owner.token);
    expect(whole.status).toBe(200);
    expect(whole.headers.get("accept-ranges")).toBe("bytes");
    expect(await whole.text()).toBe("0123456789");

    const outside = await fetch(`http://${base}${path}`, {
      headers: { authorization: `Bearer ${owner.token}`, range: "bytes=50-" },
    });
    expect(outside.status).toBe(416);
    expect(outside.headers.get("content-range")).toBe("bytes */10");
  });
});
