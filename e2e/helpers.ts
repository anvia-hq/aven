import { expect, type Page } from "@playwright/test";

// A fresh account for one test; `prefix` only makes the address easy to trace back to a spec.
export async function registerUser(page: Page, prefix: string, name = "E2E User") {
  const email = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@aven.test`;
  await page.goto("/register");
  const nameField = page.getByLabel("Name");
  await expect(nameField).toBeVisible();
  await expect(nameField).toBeEnabled();
  await nameField.fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/threads$/);
  return email;
}

// A project lives on a runner; one that never connects is enough to create projects and threads.
export async function addRunner(page: Page) {
  const response = await page.request.post("/api/runtimes", { data: { name: "runner" } });
  expect(response.ok()).toBe(true);
}
