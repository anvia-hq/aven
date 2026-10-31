import { describe, expect, test } from "bun:test";

import { runIdentities } from "./grants";
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

  describe("POST /workload-identity/token", () => {
    const mint = (body: unknown, credential?: string) => {
      const headers = new Headers({ "content-type": "application/json" });
      if (credential) headers.set("authorization", `Bearer ${credential}`);
      return workloadIdentityRouter.handle(
        new Request("http://localhost/workload-identity/token", {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        }),
      );
    };
    const identity = {
      organizationId: "org",
      projectId: "project",
      threadId: "thread",
      userId: "user",
      email: "person@example.com",
    };

    test("gives a run's credential a token", async () => {
      const credential = runIdentities.issue("route-run", identity);

      const response = await mint({ audience: "https://svc" }, credential);

      expect(response.status).toBe(200);
      expect(((await response.json()) as { token: string }).token.split(".")).toHaveLength(3);
      runIdentities.revoke("route-run");
    });

    test("refuses a missing, unknown or ended credential", async () => {
      const credential = runIdentities.issue("ended-run", identity);
      runIdentities.revoke("ended-run");

      expect((await mint({ audience: "a" })).status).toBe(401);
      expect((await mint({ audience: "a" }, "avid_nope")).status).toBe(401);
      expect((await mint({ audience: "a" }, credential)).status).toBe(401);
    });

    test("refuses a request with no audience", async () => {
      const credential = runIdentities.issue("no-audience", identity);

      expect((await mint({}, credential)).status).toBe(422);
      runIdentities.revoke("no-audience");
    });
  });
});
