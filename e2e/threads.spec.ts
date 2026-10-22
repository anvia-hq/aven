import { expect, test, type Page } from "@playwright/test";

const unique = () => `thr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@aven.test`;

async function register(page: Page) {
  await page.goto("/register");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Name").fill("Thread User");
  await page.getByLabel("Email").fill(unique());
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/threads$/);
}

test.describe("threads (mock agent UI)", () => {
  test("new thread page lists recent threads and suggestions", async ({ page }) => {
    await register(page);

    await expect(page.getByRole("heading", { name: "What should we build?" })).toBeVisible();
    await expect(page.getByLabel("Suggestions").getByRole("button")).toHaveCount(4);

    const recent = page.getByRole("region", { name: "Recent threads" });
    await expect(recent.getByRole("link", { name: /Add rate limiting to the API/ })).toBeVisible();
    await expect(
      page.locator('[data-slot="sidebar"]').getByText("Fix flaky sign-out e2e test"),
    ).toBeVisible();
  });

  test("an existing thread shows messages, tool calls and an expandable diff", async ({ page }) => {
    await register(page);
    await page
      .getByRole("region", { name: "Recent threads" })
      .getByRole("link", { name: /Add rate limiting to the API/ })
      .click();

    await expect(page).toHaveURL(/\/threads\/t-rate-limit$/);
    await expect(page.getByRole("heading", { name: "Add rate limiting to the API" })).toBeVisible();
    await expect(page.locator('[data-role="user"]')).toContainText("60 requests per minute");
    await expect(page.getByText("Typecheck passes")).toBeVisible();

    const edit = page.getByRole("button", { name: /Edited.*rate-limit\/service\.ts/ });
    await expect(edit).toBeVisible();
    await edit.click();
    await expect(page.getByText("export const rateLimitService = {")).toBeVisible();
  });

  test("sending a prompt creates a thread and the mock agent replies with tool calls", async ({
    page,
  }) => {
    await register(page);

    await page.getByLabel("Prompt").fill("Add a /version endpoint");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page).toHaveURL(/\/threads\/t-[a-z0-9]+$/);
    await expect(page.locator('[data-role="user"]')).toContainText("Add a /version endpoint");
    await expect(page.getByText("This is a mock reply")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-role="assistant"] button')).not.toHaveCount(0);

    // The new thread is listed in the sidebar and the prompt is usable again.
    await expect(
      page.locator('[data-slot="sidebar"]').getByText("Add a /version endpoint"),
    ).toBeVisible();
    await expect(page.getByLabel("Prompt")).toBeEnabled();
  });

  test("the New button returns to the new thread page", async ({ page }) => {
    await register(page);
    await page
      .getByRole("link", { name: /Fix flaky sign-out e2e test/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/threads\/t-flaky-e2e$/);

    await page.getByRole("button", { name: "New" }).click();
    await expect(page).toHaveURL(/\/threads$/);
  });
});
