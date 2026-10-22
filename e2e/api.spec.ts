import { expect, test } from "@playwright/test";

const API_URL = "http://localhost:8100";
const WEB_URL = "http://localhost:5174";

const unique = () => `api-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@aven.test`;

// Better Auth rejects cookie-bearing requests without an Origin header.
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
    for (const path of ["/api/dashboard/stats", "/api/users"]) {
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

    const stats = await request.get("/api/dashboard/stats");
    expect(stats.status()).toBe(200);
    const body = await stats.json();
    expect(body.users).toBeGreaterThanOrEqual(1);
    expect(body.activeSessions).toBeGreaterThanOrEqual(1);
    expect(body.signupsLast7Days).toBeGreaterThanOrEqual(1);

    const users = await request.get("/api/users");
    expect(users.status()).toBe(200);
    const list: { id: string; email: string }[] = await users.json();
    expect(list.map((u) => u.email)).toContain(email);

    const signOut = await request.post("/api/auth/sign-out", { data: {} });
    expect(signOut.status()).toBe(200);
    expect((await request.get("/api/dashboard/stats")).status()).toBe(401);
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

  test("a user can update only their own profile", async ({ request }) => {
    const email = unique();
    const signUp = await request.post("/api/auth/sign-up/email", {
      data: { name: "Before", email, password: "password123" },
    });
    const { user } = await signUp.json();

    const own = await request.patch(`/api/users/${user.id}`, { data: { name: "After" } });
    expect(own.status()).toBe(200);
    expect((await own.json()).name).toBe("After");

    const list: { id: string }[] = await (await request.get("/api/users")).json();
    const other = list.find((u) => u.id !== user.id);
    if (other) {
      const res = await request.patch(`/api/users/${other.id}`, { data: { name: "Nope" } });
      expect(res.status()).toBe(403);
    }

    const invalid = await request.patch(`/api/users/${user.id}`, { data: { name: "" } });
    expect(invalid.status()).toBe(422);
  });
});
