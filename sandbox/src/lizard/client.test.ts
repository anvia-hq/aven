import { afterEach, describe, expect, test } from "bun:test";

import { clearLizardProjectCache, LizardApiError, LizardClient } from "./client";

afterEach(() => clearLizardProjectCache());

describe("LizardClient", () => {
  test("resolves project by slug, sends X-API-Key, and creates a sandbox", async () => {
    const requests: { method: string; path: string; body: unknown; apiKey: string | null }[] = [];
    const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      const headers = new Headers(init?.headers);
      requests.push({ method, path: url.pathname, body, apiKey: headers.get("X-API-Key") });

      if (url.pathname === "/api/projects") {
        return Response.json([
          { id: "proj_1", slug: "aven-cloud", name: "Aven Cloud" },
          { id: "proj_2", slug: "other", name: "Other" },
        ]);
      }

      if (url.pathname === "/api/sandboxes" && method === "POST") {
        return Response.json({ sandboxId: "sb_abc123", status: "running", region: "us-east-1" });
      }

      return Response.json({ error: "unexpected" }, { status: 500 });
    }) as typeof fetch;

    const client = new LizardClient(fetchFn, "https://lizard.test");
    const created = await client.createSandbox("liz_secret_key", {
      runtimeId: "rt-1",
      machineType: "default",
      project: "aven-cloud",
    });

    expect(created).toMatchObject({ id: "sb_abc123", state: "running", region: "us-east-1" });
    expect(requests).toHaveLength(2);
    expect(requests[0]).toMatchObject({
      method: "GET",
      path: "/api/projects",
      apiKey: "liz_secret_key",
    });
    expect(requests[1]).toMatchObject({
      method: "POST",
      path: "/api/sandboxes",
      apiKey: "liz_secret_key",
      body: {
        template: "base",
        size: "medium",
        projectId: "proj_1",
        region: "us-east-1",
        metadata: { avenRuntimeId: "rt-1" },
      },
    });
  });

  test("auto-selects the sole project when project is omitted", async () => {
    const fetchFn = (async (input: RequestInfo | URL) => {
      const url = new URL(String(input));

      if (url.pathname === "/api/projects") {
        return Response.json([{ id: "proj_only", slug: "solo", name: "Solo" }]);
      }

      return Response.json({ sandboxId: "sb_only", status: "running" });
    }) as typeof fetch;

    const client = new LizardClient(fetchFn, "https://lizard.test");
    const created = await client.createSandbox("liz_solo_key", {
      runtimeId: "rt-2",
      machineType: "small",
    });

    expect(created.id).toBe("sb_only");
  });

  test("clamps trial lifetime automatically on TRIAL_SANDBOX_LIFETIME", async () => {
    const timeouts: number[] = [];
    const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));

      if (url.pathname === "/api/projects") {
        return Response.json([{ id: "proj_1", slug: "p1" }]);
      }

      if (url.pathname === "/api/sandboxes") {
        const body = JSON.parse(String(init?.body)) as { timeoutMs: number };
        timeouts.push(body.timeoutMs);

        if (body.timeoutMs > 3_600_000) {
          return Response.json(
            {
              error: "Trial sandboxes live at most 1 hour",
              code: "TRIAL_SANDBOX_LIFETIME",
              maxTimeoutMs: 3_600_000,
            },
            { status: 403 },
          );
        }

        return Response.json({ sandboxId: "sb_trial", status: "running" });
      }

      return Response.json({}, { status: 404 });
    }) as typeof fetch;

    const client = new LizardClient(fetchFn, "https://lizard.test");
    const created = await client.createSandbox("liz_trial", {
      runtimeId: "rt-trial",
      machineType: "small",
      timeoutMs: 7_200_000,
    });

    expect(created.id).toBe("sb_trial");
    expect(timeouts).toEqual([7_200_000, 3_600_000]);
  });

  test("falls back to any region when default us-east-1 returns region_unavailable", async () => {
    const regions: (string | undefined)[] = [];
    const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));

      if (url.pathname === "/api/projects") return Response.json([{ id: "proj_1" }]);

      const body = JSON.parse(String(init?.body)) as { region?: string };
      regions.push(body.region);

      if (body.region === "us-east-1") {
        return Response.json(
          { error: "No capacity in region", code: "region_unavailable" },
          { status: 503 },
        );
      }

      return Response.json({ sandboxId: "sb_eu", status: "running", region: "eu-west-lim-a" });
    }) as typeof fetch;

    const client = new LizardClient(fetchFn, "https://lizard.test");
    const created = await client.createSandbox("liz_region", {
      runtimeId: "rt-region",
      machineType: "default",
    });

    expect(created.id).toBe("sb_eu");
    expect(regions).toEqual(["us-east-1", undefined]);
  });

  test("saves, reads, restores, and deletes snapshots by snapshot id", async () => {
    const calls: string[] = [];
    const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const method = init?.method ?? "GET";
      calls.push(`${method} ${url.pathname}`);

      if (method === "POST" && url.pathname === "/api/sandboxes/sb_1/snapshot") {
        return Response.json({
          id: "snap_123",
          name: "aven-project-1",
          status: "building",
          error: null,
        });
      }

      if (method === "GET" && url.pathname === "/api/sandbox-snapshots/snap_123") {
        return Response.json({
          id: "snap_123",
          name: "aven-project-1",
          projectId: "proj_1",
          region: "eu-west-lim-a",
          status: "ready",
          error: null,
        });
      }

      if (method === "POST" && url.pathname === "/api/sandboxes") {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        expect(body).toMatchObject({
          snapshotId: "snap_123",
          projectId: "proj_1",
          region: "eu-west-lim-a",
        });
        return Response.json({ sandboxId: "sb_restored", status: "running" });
      }

      if (method === "DELETE" && url.pathname === "/api/sandbox-snapshots/snap_123") {
        return new Response(null, { status: 204 });
      }

      return Response.json({}, { status: 404 });
    }) as typeof fetch;

    const client = new LizardClient(fetchFn, "https://lizard.test");
    const saved = await client.saveSnapshot("liz_snap", "sb_1", "aven-project-1");
    expect(saved).toEqual({ name: "snap_123", status: "saving", error: null });

    const ready = await client.getSavedSnapshot("liz_snap", saved.name);
    expect(ready).toEqual({ name: "snap_123", status: "ready", error: null });

    const restored = await client.createSandbox("liz_snap", {
      runtimeId: "rt-3",
      machineType: "default",
      from: saved.name,
    });
    expect(restored.id).toBe("sb_restored");

    await client.deleteSavedSnapshot("liz_snap", saved.name);
    expect(calls).toEqual([
      "POST /api/sandboxes/sb_1/snapshot",
      "GET /api/sandbox-snapshots/snap_123",
      "GET /api/sandbox-snapshots/snap_123",
      "POST /api/sandboxes",
      "DELETE /api/sandbox-snapshots/snap_123",
    ]);
  });

  test("redacts Lizard keys and runner tokens from error messages", async () => {
    const fetchFn = (async (_input: RequestInfo | URL) =>
      Response.json(
        { error: "Failed for liz_supersecret123 and avrt_tokensecret456" },
        { status: 500 },
      )) as typeof fetch;

    const client = new LizardClient(fetchFn, "https://lizard.test");

    try {
      await client.getSandbox("liz_supersecret123", "sb_1");
      throw new Error("expected failure");
    } catch (error) {
      expect(error).toBeInstanceOf(LizardApiError);
      expect((error as Error).message).not.toContain("liz_supersecret123");
      expect((error as Error).message).not.toContain("avrt_tokensecret456");
      expect((error as Error).message).toContain("liz_…");
    }
  });
});
