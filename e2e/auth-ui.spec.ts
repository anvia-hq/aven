import { expect, test } from "@playwright/test";

import { registerUser } from "./helpers";

const API_URL = process.env.E2E_API_URL ?? "http://localhost:8100";

test.describe("platform auth", () => {
  test("health is public, directly and through the platform's /api proxy", async ({ request }) => {
    const direct = await request.get(`${API_URL}/health`);
    expect(direct.status()).toBe(200);
    expect(await direct.json()).toEqual({ status: "ok" });

    const proxied = await request.get("/api/health");
    expect(proxied.status()).toBe(200);
    expect(await proxied.json()).toEqual({ status: "ok" });
  });

  test("unauthenticated visitors are sent to the login page", async ({ page }) => {
    await page.goto("/threads");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "Sign in to Aven" })).toBeVisible();

    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("sign up lands on threads, sign out and sign in again", async ({ page }) => {
    const password = "password123";
    const email = await registerUser(page, "ui", "UI User");

    const userCard = page.locator('[data-slot="sidebar-header"]');
    await expect(userCard.getByText("UI User")).toBeVisible();

    await userCard.getByRole("button", { name: /UI User/ }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);
    expect((await page.request.get("/api/providers")).status()).toBe(401);
    await page.goto("/threads");
    await expect(page).toHaveURL(/\/login$/);

    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/threads$/);
    await expect(userCard.getByText("UI User")).toBeVisible();
  });

  test("login and register link to each other", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("link", { name: "Register" }).click();
    await expect(page).toHaveURL(/\/register$/);
    await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();

    await page.getByRole("link", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("shows an error for a wrong password", async ({ page }) => {
    const email = await registerUser(page, "wrong", "Wrong Password User");
    await page.context().clearCookies();
    await page.goto("/login");
    await expect(page.getByLabel("Email")).toBeVisible();
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("wrong-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();

    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("a signed-in user visiting /login is redirected to threads", async ({ page }) => {
    await registerUser(page, "ui", "Redirect User");

    await page.goto("/login");
    await expect(page).toHaveURL(/\/threads$/);
  });
});
