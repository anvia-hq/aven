import { expect, test, type Page } from "@playwright/test";

import { addOnlineRunner, connectGithub, importRepository, registerUser } from "./helpers";

const SHOT = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

async function createProject(page: Page) {
  await addOnlineRunner(page);
  await connectGithub(page);
  await page.goto("/threads");
  await importRepository(page, "composer-app");
}

async function projectId(page: Page, name: string) {
  const projects = (await (await page.request.get("/api/projects")).json()) as {
    id: string;
    name: string;
  }[];
  const project = projects.find((candidate) => candidate.name === name);
  expect(project).toBeTruthy();
  return project!.id;
}

async function pickModel(page: Page, model: string) {
  await page.getByRole("menuitem", { name: /^Model\b/ }).hover();
  await page.getByRole("menuitem", { name: model, exact: true }).click();
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
    await expect(page.getByRole("button", { name: "Model and reasoning effort" })).toHaveCount(0);
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
    const reasoning = page.getByRole("menuitem", { name: /^Reasoning\b/ });

    await menu.click();
    await expect(reasoning).toHaveCount(0);
    await pickModel(page, "o3");
    await menu.click();
    await expect(reasoning).toBeVisible();
    await reasoning.hover();
    await page.getByRole("menuitem", { name: "High", exact: true }).click();
    await expect(menu).toContainText("High");

    await menu.click();
    await pickModel(page, "gpt-4o");
    await menu.click();
    await expect(reasoning).toHaveCount(0);

    await pickModel(page, "o3");
    await expect(menu).toContainText("Medium");
    await menu.click();
    await reasoning.hover();
    await page.getByRole("menuitem", { name: "High", exact: true }).click();
    await expect(menu).toContainText("High");

    await page.reload();
    await expect(menu).toContainText("High");
    await expect(menu).toContainText("o3");
    await page.getByRole("button", { name: "Project" }).click();
    await page.getByRole("button", { name: "composer-app" }).click();
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
      await page.goto("/threads?project=" + (await projectId(page, "composer-app")));
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

  test("a thread keeps its draft, attached image included, across a reload", async ({ page }) => {
    await registerUser(page, "cmp", "Composer User");
    await createProject(page);
    const made = await page.request.post("/api/threads", {
      data: { projectId: await projectId(page, "composer-app") },
    });
    const { id } = (await made.json()) as { id: string };
    await page.goto(`/threads/${id}`);

    const prompt = page.getByRole("textbox", { name: "Prompt" });
    await prompt.fill("look at this");
    await page.locator('input[type="file"]').setInputFiles({
      name: "shot.png",
      mimeType: "image/png",
      buffer: SHOT,
    });
    await expect(page.getByRole("button", { name: "Remove shot.png" })).toBeVisible();

    await page.reload();

    await expect(page.getByRole("textbox", { name: "Prompt" })).toContainText("look at this");
    await expect(page.getByRole("button", { name: "Remove shot.png" })).toBeVisible();
    await expect(page.getByRole("img", { name: "shot.png" })).toHaveAttribute("src", /^blob:/);
  });
});
