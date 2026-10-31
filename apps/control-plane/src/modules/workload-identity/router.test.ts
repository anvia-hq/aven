import { describe, expect, test } from "bun:test";

import { workloadIdentityRouter } from "./router";

describe("workload identity router", () => {
  test("serves the discovery document and the key set without a session", async () => {
    const discovery = await workloadIdentityRouter.handle(
      new Request("http://localhost/workload-identity/.well-known/openid-configuration"),
    );
    const keys = await workloadIdentityRouter.handle(
      new Request("http://localhost/workload-identity/jwks.json"),
    );

    expect(discovery.status).toBe(200);
    expect(((await discovery.json()) as { jwks_uri: string }).jwks_uri).toEndWith(
      "/api/workload-identity/jwks.json",
    );
    expect(keys.status).toBe(200);
    expect(((await keys.json()) as { keys: unknown[] }).keys).toHaveLength(1);
  });
});
