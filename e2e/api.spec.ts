import { expect, test } from "@playwright/test";

const API_URL = "http://localhost:8100";
const WEB_URL = "http://localhost:5174";

const unique = () => `api-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@aven.test`;

test.use({ extraHTTPHeaders: { origin: WEB_URL } });

test.describe("control-plane API (through the platform /api proxy)", () => {
  test("health is public, directly and via the proxy", async ({ request }) => {
    const direct = await request.get(`${API_URL}/health`);
    expect(direct.status()).toBe(200);
    expect(await direct.json()).toEqual({ status: "ok" });

    const proxied = await request.get("/api/health");
    expect(proxied.status()).toBe(200);
    expect(await proxied.json()).toEqual({ status: "ok" });
  });

  test("protected routes return 401 without a session", async ({ request }) => {
    for (const path of ["/api/providers", "/api/threads"]) {
      const res = await request.get(path);
      expect(res.status(), path).toBe(401);
    }
  });

  test("sign up, read protected data, sign out", async ({ request }) => {
    const email = unique();

    const signUp = await request.post("/api/auth/sign-up/email", {
      data: { name: "API User", email, password: "password123" },
    });
    expect(signUp.status()).toBe(200);

    const session = await request.get("/api/auth/get-session");
    expect((await session.json()).user.email).toBe(email);
    const providers = await request.get("/api/providers");
    expect(providers.status()).toBe(200);
    expect((await request.get("/api/users")).status()).toBe(404);

    const signOut = await request.post("/api/auth/sign-out", { data: {} });
    expect(signOut.status()).toBe(200);
    expect((await request.get("/api/providers")).status()).toBe(401);
  });

  test("sign in rejects a wrong password", async ({ request }) => {
    const email = unique();
    await request.post("/api/auth/sign-up/email", {
      data: { name: "API User", email, password: "password123" },
    });
    await request.post("/api/auth/sign-out", { data: {} });

    const bad = await request.post("/api/auth/sign-in/email", {
      data: { email, password: "wrong-password" },
    });
    expect(bad.status()).toBe(401);

    const good = await request.post("/api/auth/sign-in/email", {
      data: { email, password: "password123" },
    });
    expect(good.status()).toBe(200);
  });
});
