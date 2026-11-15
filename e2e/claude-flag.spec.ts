import { expect, test } from "@playwright/test";

import { registerUser } from "./helpers";

const now = new Date().toISOString();

const repository = {
  id: "00000000-0000-4000-8000-0000000000cc",
  name: "widgets",
  repoFullName: "acme/widgets",
  defaultBranch: "main",
  directory: null,
  runtimeId: null,
  createdBy: "someone",
  createdAt: now,
  updatedAt: now,
};

test.describe("the Claude agent flag", () => {
  test("is on by default, so Claude Subscription is in Settings", async ({ page }) => {
    await registerUser(page, "claudeon", "Claude On");
    const config = (await (await page.request.get("/api/platform/config")).json()) as {
      claudeBackend: boolean;
    };
    expect(config.claudeBackend).toBe(true);

    await page.goto("/settings/general");
    await expect(page.getByRole("link", { name: "Claude Subscription" })).toBeVisible();
  });

  test("when it is off, Settings and the composer leave Claude out", async ({ page }) => {
    await registerUser(page, "claudeoff", "Claude Off");
    await page.request.post("/api/providers", {
      data: { kind: "openai", name: "Work", apiKey: "sk-test-1234" },
    });
    await page.route("**/api/providers/*/models", (route) =>
      route.fulfill({ json: { models: ["gpt-4o"], efforts: {} } }),
    );
    await page.route("**/api/platform/config", async (route) => {
      const real = await route.fetch();
      await route.fulfill({ json: { ...(await real.json()), claudeBackend: false } });
    });
    await page.route("**/api/projects", (route) =>
      route.request().method() === "GET" ? route.fulfill({ json: [repository] }) : route.continue(),
    );

    await page.goto("/settings/general");
    await expect(page.getByRole("link", { name: "Providers" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Claude Subscription" })).toHaveCount(0);

    await page.goto("/settings/claude");
    await expect(page.getByText("The Claude agent is turned off on this server")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Claude setup token" })).toHaveCount(0);

    await page.goto("/threads");
    await page.getByRole("combobox", { name: "Project" }).click();
    await page.getByRole("option", { name: "widgets" }).click();
    await page.getByRole("button", { name: "Model and reasoning effort" }).click();
    await page.getByRole("button", { name: /^(Provider default|gpt-4o)$/ }).click();
    await expect(page.getByRole("option", { name: "gpt-4o" })).toBeVisible();
    await expect(page.getByRole("option", { name: /Sonnet 5\.5/ })).toHaveCount(0);
  });
});
