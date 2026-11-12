import { describe, expect, test } from "bun:test";

import { ACTING_HEADER } from "../auth/acting";
import { createBotApi } from "./service";
import type { KnownRoute } from "./types";

const routes: KnownRoute[] = [
  { method: "GET", path: "/threads" },
  { method: "DELETE", path: "/folders/:id" },
  { method: "POST", path: "/runtimes" },
  { method: "GET", path: "/auth/*" },
];

function api(organizations = [{ id: "org1", name: "One" }]) {
  const seen: Request[] = [];
  const botApi = createBotApi({
    routes: () => routes,
    organizationsOf: async () => organizations,
    handle: async (request) => {
      seen.push(request);
      return Response.json({ ok: true, apiKey: "sk-secret", items: [1] });
    },
  });
  return { botApi, seen };
}

const call = (path: string, extra: object = {}, method = "GET") =>
  ({ replyId: "r", op: "call", method, path, ...extra }) as never;

describe("bot api", () => {
  test("a call that never answers is cut off after the time limit, and the grant ends", async () => {
    const hung = createBotApi({
      routes: () => routes,
      organizationsOf: async () => [{ id: "org1", name: "One" }],
      handle: () => new Promise<Response>(() => undefined),
      timeoutMs: 20,
    });
    await expect(
      hung.answer({ userId: "u", params: call("/threads"), onPersonsWord: true }),
    ).rejects.toThrow("too long");
  });

  test("search lists what is allowed with its tier, never a blocked route, and the workspaces", async () => {
    const { botApi } = api();
    const result = (await botApi.answer({
      userId: "u",
      params: { replyId: "r", op: "search" },
      onPersonsWord: false,
    })) as { routes: { method: string; path: string; tier: string }[]; organizations: unknown[] };
    expect(result.routes.map((route) => `${route.method} ${route.path} ${route.tier}`)).toEqual([
      "GET /threads read",
      "DELETE /folders/:id confirm",
    ]);
    expect(result.organizations).toEqual([{ id: "org1", name: "One" }]);
  });

  test("a read goes through as the person, with secret fields hidden, even on a note", async () => {
    const { botApi, seen } = api();
    const result = await botApi.answer({
      userId: "u",
      params: call("/threads?x=1"),
      onPersonsWord: false,
    });
    expect(result).toEqual({
      status: 200,
      body: { ok: true, apiKey: "[hidden]", items: [1] },
    });
    expect(seen[0]?.headers.get(ACTING_HEADER)).toBeTruthy();
    expect(new URL(seen[0]!.url).pathname + new URL(seen[0]!.url).search).toBe("/threads?x=1");
  });

  test("a change needs the person's own message, and never carries a secret", async () => {
    const { botApi, seen } = api();
    const post = call("/projects", { body: { name: "x" } }, "POST");
    await expect(
      botApi.answer({ userId: "u", params: post, onPersonsWord: false }),
    ).rejects.toThrow("own message");
    await expect(
      botApi.answer({
        userId: "u",
        params: call("/providers", { body: { apiKey: "k" } }, "POST"),
        onPersonsWord: true,
      }),
    ).rejects.toThrow("secret");
    expect(seen).toHaveLength(0);
    await botApi.answer({ userId: "u", params: post, onPersonsWord: true });
    expect(seen).toHaveLength(1);
  });

  test("a hard-to-undo route waits for confirmed: true", async () => {
    const { botApi, seen } = api();
    const del = call("/folders/1", {}, "DELETE");
    await expect(botApi.answer({ userId: "u", params: del, onPersonsWord: true })).rejects.toThrow(
      "confirmed: true",
    );
    await botApi.answer({
      userId: "u",
      params: call("/folders/1", { confirmed: true }, "DELETE"),
      onPersonsWord: true,
    });
    expect(seen).toHaveLength(1);
  });

  test("blocked routes are refused whatever the flags", async () => {
    const { botApi, seen } = api();
    for (const params of [
      call("/auth/get-session"),
      call("/runtimes", { confirmed: true }, "POST"),
      call("/threads/1/events"),
    ]) {
      await expect(botApi.answer({ userId: "u", params, onPersonsWord: true })).rejects.toThrow(
        "cannot use that route",
      );
    }
    expect(seen).toHaveLength(0);
  });

  test("more than one workspace needs a choice, and only the person's own", async () => {
    const { botApi } = api([
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ]);
    await expect(
      botApi.answer({ userId: "u", params: call("/threads"), onPersonsWord: true }),
    ).rejects.toThrow("organizationId");
    await expect(
      botApi.answer({
        userId: "u",
        params: call("/threads", { organizationId: "c" }),
        onPersonsWord: true,
      }),
    ).rejects.toThrow("not in that workspace");
    const ok = await botApi.answer({
      userId: "u",
      params: call("/threads", { organizationId: "b" }),
      onPersonsWord: true,
    });
    expect(ok).toMatchObject({ status: 200 });
  });
});
