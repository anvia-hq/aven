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

// Connects the organization to the (fake) GitHub installation by going through the real callback:
// the signed state comes from the control plane, and GitHub's answers from e2e/fake-github.ts.
export async function connectGithub(page: Page) {
  const response = await page.request.get("/api/github");
  const { installUrl } = (await response.json()) as { installUrl: string };
  const state = new URL(installUrl).searchParams.get("state")!;
  const callback = `/api/github/callback?installation_id=1&code=fake&state=${encodeURIComponent(state)}`;
  await page.goto(callback);
  await expect(page).toHaveURL(/\/projects\?github=connected$/);
}

// A project is an imported repository; the fake GitHub offers `acme/<name>` for a few names.
export async function importRepository(page: Page, name: string) {
  await page.getByRole("button", { name: "Import repository" }).click();
  await page.getByRole("combobox", { name: "Repository" }).click();
  await page.getByRole("option", { name: `acme/${name}` }).click();
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page.getByText("Repository imported")).toBeVisible();
}
