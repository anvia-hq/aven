import { expect, test } from "@playwright/test";

import { registerUser } from "./helpers";

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
    await expect(page.getByRole("heading", { name: "Aven" })).toBeVisible();
    await expect(page.getByText("Say hello to Aven.")).toBeVisible();

    await page.getByRole("textbox", { name: "Message" }).fill("hello bot");
    await page.getByRole("textbox", { name: "Message" }).press("Enter");
    await expect(page.getByText("hello bot", { exact: true })).toBeVisible();

    // The bot types, then each message shows after its own pause.
    await expect(page.getByRole("status", { name: /typing/ })).toBeVisible();
    await expect(page.getByText("Hey there!")).toBeVisible();
    await expect(page.getByText("You said: hello bot")).toBeVisible();
    await expect(page.getByRole("status", { name: /typing/ })).toBeHidden();

    // The chat is the server's: it is all there after a reload.
    await page.reload();
    await expect(page.getByText("hello bot", { exact: true })).toBeVisible();
    await expect(page.getByText("Hey there!")).toBeVisible();
    await expect(page.getByText("You said: hello bot")).toBeVisible();
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
    await expect(page.getByRole("heading", { name: "Pip" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Message" })).toHaveAttribute(
      "placeholder",
      "Message Pip",
    );

    // It is kept: the bot is the same after a reload, in the settings too.
    await page.reload();
    await expect(page.getByRole("heading", { name: "Pip" })).toBeVisible();
    await page.getByRole("button", { name: "Bot settings" }).click();
    await expect(page.getByLabel("Instruction")).toHaveValue("Talk like a pirate.");
    await expect(page.getByLabel("Avatar")).toHaveValue("🐦");
  });
});
