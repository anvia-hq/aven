import { expect, test } from "@playwright/test";

import { registerUser } from "./helpers";

const unique = () => `ui-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@aven.test`;

test.describe("platform auth", () => {
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

    // The user card is in the sidebar header and shows the account's name.
    const userCard = page.locator('[data-slot="sidebar-header"]');
    await expect(userCard.getByText("UI User")).toBeVisible();

    await userCard.getByRole("button", { name: /UI User/ }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);
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

  test("theme defaults to dark and the toggle switches and persists it", async ({ page }) => {
    await page.goto("/register");
    await expect(page.locator("html")).toHaveClass(/dark/);
    await registerUser(page, "ui", "Theme User");

    // Sidebar trigger lives in the sidebar header.
    await expect(page.locator('[data-slot="sidebar-trigger"]')).toBeVisible();
    const toggle = page.getByRole("button", { name: "Toggle theme" });
    await toggle.click();
    await expect(page.locator("html")).not.toHaveClass(/dark/);

    await page.reload();
    await expect(page.locator("html")).not.toHaveClass(/dark/);

    await toggle.click();
    await expect(page.locator("html")).toHaveClass(/dark/);
  });

  test("shows an error for invalid credentials", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByLabel("Email")).toBeVisible();
    await page.getByLabel("Email").fill(unique());
    await page.getByLabel("Password").fill("password123");
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
