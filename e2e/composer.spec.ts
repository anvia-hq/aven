import { expect, test, type Page } from "@playwright/test";

import { addRunner, connectGithub, importRepository, registerUser } from "./helpers";

async function createProject(page: Page) {
  await addRunner(page);
  await connectGithub(page);
  await page.goto("/threads");
  await importRepository(page, "composer-app");
}

async function pickModel(page: Page, model: string) {
  await page.getByRole("button", { name: /^(Provider default|gpt-4o|o3)$/ }).click();
  await page.getByRole("option", { name: model }).click();
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
}

test.describe("prompt composer", () => {
  test("without a provider it offers to add one", async ({ page }) => {
    await registerUser(page, "cmp", "Composer User");
    await createProject(page);
    await expect(
      page.getByRole("link", { name: "Add a provider to choose a model" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Model and reasoning effort" }).click();
    await expect(page.getByRole("option", { name: /^Sonnet 5\.5/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Back" })).toHaveCount(0);
  });

  test("the model and reasoning effort picked are sent with the message", async ({ page }) => {
    await registerUser(page, "cmp", "Composer User");
    const saved = await page.request.post("/api/providers", {
      data: { kind: "openai", name: "Work", apiKey: "sk-test-1234" },
    });
    const provider = (await saved.json()) as { id: string };

    await page.route("**/api/providers/*/models", (route) =>
      route.fulfill({
        json: {
          models: ["gpt-4o", "o3"],
          efforts: { o3: { options: ["low", "medium", "high"], defaultValue: "medium" } },
        },
      }),
    );
    let sent: Record<string, unknown> | undefined;
    await page.route("**/api/threads/*/messages", (route) => {
      sent = route.request().postDataJSON() as Record<string, unknown>;
      return route.fulfill({ status: 202, json: { ok: true } });
    });

    await createProject(page);
    const menu = page.getByRole("button", { name: "Model and reasoning effort" });
    const effort = page.getByRole("slider", { name: "Reasoning effort" });

    await menu.click();
    await expect(effort).toHaveCount(0);
    await pickModel(page, "o3");
    await expect(effort).toBeVisible();
    await effort.focus();
    await page.keyboard.press("End");
    await expect(effort).toHaveAttribute("aria-valuetext", "high");

    await pickModel(page, "gpt-4o");
    await expect(effort).toHaveCount(0);

    await pickModel(page, "o3");
    await expect(effort).toHaveAttribute("aria-valuetext", "medium");
    await effort.focus();
    await page.keyboard.press("End");
    await expect(effort).toHaveAttribute("aria-valuetext", "high");
    await page.keyboard.press("Escape");

    await page.reload();
    await expect(menu).toContainText("High");
    await expect(menu).toContainText("o3");
    await page.getByRole("combobox", { name: "Project" }).click();
    await page.getByRole("option", { name: "composer-app" }).click();
    await page.getByRole("textbox", { name: "Prompt" }).fill("hello");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page).toHaveURL(/\/threads\/[0-9a-f-]{36}$/);
    await expect.poll(() => sent).toBeDefined();
    const { steerId, ...chosen } = sent as { steerId?: string };
    expect(typeof steerId).toBe("string");
    expect(chosen).toEqual({
      prompt: "hello",
      providerId: provider.id,
      modelId: "o3",
      reasoningEffort: "high",
    });
  });

  test("each thread keeps its own model, and a new thread starts from the last one picked", async ({
    page,
  }) => {
    await registerUser(page, "cmp", "Composer User");
    await page.request.post("/api/providers", {
      data: { kind: "openai", name: "Work", apiKey: "sk-test-1234" },
    });
    await page.route("**/api/providers/*/models", (route) =>
      route.fulfill({ json: { models: ["gpt-4o", "o3"], efforts: {} } }),
    );
    await page.route("**/api/threads/*/messages", (route) =>
      route.fulfill({ status: 202, json: { ok: true } }),
    );
    await createProject(page);
    const menu = page.getByRole("button", { name: "Model and reasoning effort" });

    async function startOn(model: string) {
      await page.goto("/threads");
      await page.getByRole("combobox", { name: "Project" }).click();
      await page.getByRole("option", { name: "composer-app" }).click();
      await menu.click();
      await pickModel(page, model);
      await page.keyboard.press("Escape");
      await page.getByRole("textbox", { name: "Prompt" }).fill(`on ${model}`);
      await page.getByRole("button", { name: "Send" }).click();
      await expect(page).toHaveURL(/\/threads\/[0-9a-f-]{36}$/);
      return page.url();
    }

    const first = await startOn("o3");
    const second = await startOn("gpt-4o");

    await page.goto(first);
    await expect(menu).toContainText("o3");
    await page.goto(second);
    await expect(menu).toContainText("gpt-4o");
    await page.goto("/threads");
    await expect(menu).toContainText("gpt-4o");
  });
});
