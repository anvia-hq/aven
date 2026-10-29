import { expect, test, type Page } from "@playwright/test";

const unique = () => `cmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@aven.test`;

async function register(page: Page) {
  await page.goto("/register");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Name").fill("Composer User");
  await page.getByLabel("Email").fill(unique());
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/threads$/);
}

// The composer only shows once there is a project; creating one on /threads also selects it. A
// project needs a runner, and one that never connects is enough here.
async function createProject(page: Page) {
  const runner = await page.request.post("/api/runtimes", { data: { name: "runner" } });
  expect(runner.ok()).toBe(true);
  await page.getByRole("button", { name: "New project" }).click();
  await page.getByLabel("Name").fill("composer-app");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByText("Project created")).toBeVisible();
}

test.describe("prompt composer", () => {
  test("without a provider it offers to add one", async ({ page }) => {
    await register(page);
    await createProject(page);
    await expect(
      page.getByRole("link", { name: "Add a provider to choose a model" }),
    ).toBeVisible();
    await expect(page.getByRole("slider")).toHaveCount(0);
  });

  test("the model and reasoning effort picked are sent with the message", async ({ page }) => {
    await register(page);
    const saved = await page.request.post("/api/providers", {
      data: { kind: "openai", name: "Work", apiKey: "sk-test-1234" },
    });
    const provider = (await saved.json()) as { id: string };

    // The real list would ask OpenAI; only o3 has reasoning levels, as in the SDK.
    await page.route("**/api/providers/*/models", (route) =>
      route.fulfill({
        json: {
          models: ["gpt-4o", "o3"],
          efforts: { o3: { options: ["low", "medium", "high"], defaultValue: "medium" } },
        },
      }),
    );
    // Starting a run would call the provider, which e2e must never do.
    let sent: Record<string, unknown> | undefined;
    await page.route("**/api/threads/*/messages", (route) => {
      sent = route.request().postDataJSON() as Record<string, unknown>;
      return route.fulfill({ status: 202, json: { ok: true } });
    });

    await createProject(page);
    const model = page.getByRole("combobox", { name: "Model" });
    await expect(page.getByRole("slider")).toHaveCount(0);

    await model.click();
    await page.getByRole("option", { name: "o3" }).click();
    const slider = page.getByRole("slider", { name: "Reasoning effort" });
    await expect(slider).toBeVisible();
    await slider.focus();
    await page.keyboard.press("End");
    await expect(slider).toHaveAttribute("aria-valuetext", "high");

    // A model without the control has nothing to slide.
    await model.click();
    await page.getByRole("option", { name: "gpt-4o" }).click();
    await expect(page.getByRole("slider")).toHaveCount(0);
    await model.click();
    await page.getByRole("option", { name: "o3" }).click();
    await expect(page.getByRole("slider", { name: "Reasoning effort" })).toHaveAttribute(
      "aria-valuetext",
      "medium",
    );
    await page.keyboard.press("Escape");
    await page.getByRole("slider", { name: "Reasoning effort" }).focus();
    await page.keyboard.press("End");

    await page.getByLabel("Prompt").fill("hello");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page).toHaveURL(/\/threads\/[0-9a-f-]{36}$/);
    await expect.poll(() => sent).toBeDefined();
    expect(sent).toEqual({
      prompt: "hello",
      providerId: provider.id,
      modelId: "o3",
      reasoningEffort: "high",
    });
  });
});
