import { expect, test, type Page } from "@playwright/test";

import { addRunner, connectGithub, importRepository, registerUser } from "./helpers";

// The composer only shows once there is a project; importing one on /threads also selects it. A
// project needs a runner, and one that never connects is enough here.
async function createProject(page: Page) {
  await addRunner(page);
  await connectGithub(page);
  await page.goto("/threads");
  await importRepository(page, "composer-app");
}

// The model menu opens on the reasoning effort and the model in use; the model button opens the
// list of every provider's models, and choosing one goes back to the first view.
async function pickModel(page: Page, model: string) {
  await page.getByRole("button", { name: /^(Provider default|gpt-4o|o3)$/ }).click();
  await page.getByRole("option", { name: model }).click();
}

test.describe("prompt composer", () => {
  test("without a provider it offers to add one", async ({ page }) => {
    await registerUser(page, "cmp", "Composer User");
    await createProject(page);
    await expect(
      page.getByRole("link", { name: "Add a provider to choose a model" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Model and reasoning effort" })).toHaveCount(0);
  });

  test("the model and reasoning effort picked are sent with the message", async ({ page }) => {
    await registerUser(page, "cmp", "Composer User");
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
    const menu = page.getByRole("button", { name: "Model and reasoning effort" });
    const effort = page.getByRole("slider", { name: "Reasoning effort" });

    // One trigger opens one panel with the model and, for a model that has them, a slider of efforts.
    await menu.click();
    await expect(effort).toHaveCount(0);
    await pickModel(page, "o3");
    await expect(effort).toBeVisible();
    await effort.focus();
    await page.keyboard.press("End");
    await expect(effort).toHaveAttribute("aria-valuetext", "high");

    // A model without the control has no effort to choose.
    await pickModel(page, "gpt-4o");
    await expect(effort).toHaveCount(0);

    // Back on o3 the effort starts from the model's own default, then is picked again.
    await pickModel(page, "o3");
    await expect(effort).toHaveAttribute("aria-valuetext", "medium");
    await effort.focus();
    await page.keyboard.press("End");
    await page.keyboard.press("Escape");

    // The choice survives a reload.
    await page.reload();
    await expect(menu).toContainText("High");
    await expect(menu).toContainText("o3");
    // A reload forgets which project was picked, not the model.
    await page.getByRole("combobox", { name: "Project" }).click();
    await page.getByRole("option", { name: "composer-app" }).click();
    await page.getByRole("textbox", { name: "Prompt" }).fill("hello");
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

    // Picking gpt-4o for the second thread did not move the first one.
    await page.goto(first);
    await expect(menu).toContainText("o3");
    await page.goto(second);
    await expect(menu).toContainText("gpt-4o");
    // A new thread starts from the last choice.
    await page.goto("/threads");
    await expect(menu).toContainText("gpt-4o");
  });
});
