import { expect, test } from "@playwright/test";

import { registerBotPerson } from "./helpers";

test.describe("the bot chat's composer", () => {
  test("keeps what is typed, a picked skill included, across a reload", async ({ page }) => {
    await registerBotPerson(page, "bot-draft", "Draft Person");
    await page.goto("/bot");
    const message = page.getByRole("textbox", { name: "Message" });
    await message.click();
    await page.keyboard.type("/setup-s");
    await page.keyboard.press("Enter");
    await expect(message.locator('[data-mention="skill"]')).toHaveText("setup-ship");
    await page.keyboard.type(" remember this");

    await page.reload();

    const again = page.getByRole("textbox", { name: "Message" });
    await expect(again).toContainText("/setup-ship remember this");
  });

  test("is empty again once the message is sent", async ({ page }) => {
    test.slow();
    await registerBotPerson(page, "bot-draft-sent", "Sent Person");
    const provider = await page.request.post("/api/providers", {
      data: {
        kind: "openai-compatible",
        name: "Fake",
        baseUrl: "http://localhost:8102/v1",
        modelId: "fake-model",
      },
    });
    expect(provider.ok()).toBe(true);
    await page.goto("/bot");
    const message = page.getByRole("textbox", { name: "Message" });
    await message.click();
    await page.keyboard.type("hello there");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(message).toHaveText("");
    await expect(page.getByText("Hey there!")).toBeVisible();

    await page.reload();
    await expect(page.getByRole("textbox", { name: "Message" })).toHaveText("");
  });
});
