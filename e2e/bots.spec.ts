import { expect, test, type Page } from "@playwright/test";

import { registerUser } from "./helpers";

// A message in the conversation; the sidebar shows the bot's last words too.
const bubble = (page: Page, text: string) =>
  page
    .locator('[data-slot="bubble-content"]')
    .filter({ hasText: new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) });

// A person's main bot (decision 0058), on a pretend model that answers with two messages
// (e2e/fake-model.ts).
test.describe("bots", () => {
  test("the main bot is under the logo, and it answers in several messages", async ({ page }) => {
    await registerUser(page, "bot", "Bot Person");
    const provider = await page.request.post("/api/providers", {
      data: {
        kind: "openai-compatible",
        name: "Fake",
        baseUrl: "http://localhost:8102/v1",
        modelId: "fake-model",
      },
    });
    expect(provider.ok()).toBe(true);

    await page.getByRole("link", { name: "Bot", exact: true }).click();
    await expect(page).toHaveURL(/\/bot$/);
    await expect(page.getByRole("link", { name: "Aven, main bot" })).toBeVisible();
    await expect(page.getByText("Say hello to Aven.")).toBeVisible();

    await page.getByRole("textbox", { name: "Message" }).fill("hello bot");
    await page.getByRole("textbox", { name: "Message" }).press("Enter");
    await expect(bubble(page, "hello bot")).toBeVisible();

    // The bot types, then each message shows after its own pause.
    await expect(page.getByRole("status", { name: /typing/ })).toBeVisible();
    await expect(bubble(page, "Hey there!")).toBeVisible();
    await expect(bubble(page, "You said: hello bot")).toBeVisible();
    await expect(page.getByRole("status", { name: /typing/ })).toBeHidden();

    // The bot has a shell of its own: its main bot is the tile of its sidebar, in place of the
    // threads and projects.
    await expect(page.getByRole("link", { name: "Projects" })).toBeHidden();

    // The chat is the server's: it is all there after a reload.
    await page.reload();
    await expect(bubble(page, "hello bot")).toBeVisible();
    await expect(bubble(page, "Hey there!")).toBeVisible();
    await expect(bubble(page, "You said: hello bot")).toBeVisible();
  });

  test("a person with no model is told why nothing was sent", async ({ page }) => {
    await registerUser(page, "bot-none", "No Model");
    await page.goto("/bot");
    await page.getByRole("textbox", { name: "Message" }).fill("hello?");
    await page.getByRole("textbox", { name: "Message" }).press("Enter");
    await expect(page.getByText("Could not send message")).toBeVisible();
    await expect(page.getByText("ANTHROPIC_API_KEY is not set")).toBeVisible();
  });

  test("the person changes the bot's name and avatar", async ({ page }) => {
    await registerUser(page, "bot-edit", "Bot Editor");
    await page.goto("/bot");
    await page.getByRole("button", { name: "Bot settings" }).click();
    await page.getByLabel("Name").fill("Pip");
    await page.getByLabel("Avatar").fill("🐦");
    await page.getByLabel("Instruction").fill("Talk like a pirate.");
    await page.getByRole("button", { name: "Save changes" }).click();

    await expect(page.getByText("Bot saved")).toBeVisible();
    await expect(page.getByRole("link", { name: "Pip, main bot" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Message" })).toHaveAttribute(
      "placeholder",
      "Message Pip",
    );

    // It is kept: the bot is the same after a reload, in the settings too.
    await page.reload();
    await expect(page.getByRole("link", { name: "Pip, main bot" })).toBeVisible();
    await page.getByRole("button", { name: "Bot settings" }).click();
    await expect(page.getByLabel("Instruction")).toHaveValue("Talk like a pirate.");
    await expect(page.getByLabel("Avatar")).toHaveValue("🐦");
  });

  test("the person chooses the model a bot talks with", async ({ page }) => {
    await registerUser(page, "bot-model", "Model Chooser");
    const provider = await page.request.post("/api/providers", {
      data: {
        kind: "openai-compatible",
        name: "Fake",
        baseUrl: "http://localhost:8102/v1",
        modelId: "fake-model",
      },
    });
    expect(provider.ok()).toBe(true);
    const { id: providerId } = (await provider.json()) as { id: string };

    await page.goto("/settings/bots");
    const model = page.getByRole("button", { name: "Model of Aven" });
    await expect(model).toContainText("Default model");

    await model.click();
    await page.getByRole("option", { name: "fake-model" }).click();
    await expect(page.getByText("Bot saved")).toBeVisible();
    await expect(model).toContainText("fake-model");

    const bots = (await (await page.request.get("/api/bots")).json()) as {
      providerId: string | null;
      modelId: string | null;
    }[];
    expect(bots[0]).toMatchObject({ providerId, modelId: "fake-model" });

    // It is kept, and the bot answers on it.
    await page.reload();
    await expect(model).toContainText("fake-model");
    await page.goto("/bot");
    await page.getByRole("textbox", { name: "Message" }).fill("which model?");
    await page.getByRole("textbox", { name: "Message" }).press("Enter");
    await expect(bubble(page, "You said: which model?")).toBeVisible();

    // And back to the default.
    await page.goto("/settings/bots");
    await model.click();
    await page.getByRole("button", { name: "Use my default model" }).click();
    await expect(model).toContainText("Default model");
  });

  test("with no provider there is no model to choose", async ({ page }) => {
    await registerUser(page, "bot-model-none", "No Provider");
    await page.goto("/settings/bots");
    await expect(page.getByText("Your main bot")).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Add a provider to choose a model" }),
    ).toBeVisible();
  });
});
