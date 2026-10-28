import { expect, test } from "@playwright/test";

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
    const email = unique();
    const password = "password123";

    await page.goto("/register");
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Name").fill("UI User");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page).toHaveURL(/\/threads$/);
    await expect(page.locator('[data-slot="sidebar-footer"]').getByText(email)).toBeVisible();

    await page
      .locator('[data-slot="sidebar-footer"]')
      .getByRole("button", { name: new RegExp(email) })
      .click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/threads");
    await expect(page).toHaveURL(/\/login$/);

    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/threads$/);
    await expect(page.locator('[data-slot="sidebar-footer"]').getByText(email)).toBeVisible();
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
    await page.waitForLoadState("networkidle");
    await expect(page.locator("html")).toHaveClass(/dark/);

    await page.getByLabel("Name").fill("Theme User");
    await page.getByLabel("Email").fill(unique());
    await page.getByLabel("Password").fill("password123");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL(/\/threads$/);

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
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Email").fill(unique());
    await page.getByLabel("Password").fill("password123");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();

    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("a signed-in user visiting /login is redirected to threads", async ({ page }) => {
    await page.goto("/register");
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Name").fill("Redirect User");
    await page.getByLabel("Email").fill(unique());
    await page.getByLabel("Password").fill("password123");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL(/\/threads$/);

    await page.goto("/login");
    await expect(page).toHaveURL(/\/threads$/);
  });
});
