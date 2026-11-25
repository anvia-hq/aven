import { expect, test, type Page } from "@playwright/test";

import { registerBotPerson, revealToast } from "./helpers";

const bubble = (page: Page, text: string) =>
  page
    .locator('[data-slot="bubble-content"], [data-role="user"]')
    .filter({ hasText: new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) });

test.describe("bots settings and composer", () => {
  test("a bot renames itself and writes its own description when asked", async ({ page }) => {
    test.slow();
    await page.setViewportSize({ width: 1400, height: 800 });
    await registerBotPerson(page, "bot-self", "Self Person");
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
    await page.getByRole("textbox", { name: "Message" }).fill("call yourself something new");
    await page.getByRole("textbox", { name: "Message" }).press("Enter");
    await expect(bubble(page, "I am Pip now")).toBeVisible();

    await expect(page.getByRole("link", { name: "Pip, main bot" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Pip" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Message" }).locator("p")).toHaveAttribute(
      "data-placeholder",
      /^Message Pip, /,
    );

    await page.getByRole("button", { name: "Bot settings" }).click();
    await expect(page.getByLabel("Description")).toHaveValue("Keeps you company.");
    await page.getByLabel("Description").fill("Your pal at the keyboard.");
    await page.getByRole("button", { name: "Save changes" }).click();
    await page.getByRole("button", { name: "Bot settings" }).click();
    await expect(page.getByLabel("Description")).toHaveValue("Your pal at the keyboard.");
    await page.keyboard.press("Escape");

    await page.getByRole("textbox", { name: "Message" }).fill("make a bot for research");
    await page.getByRole("textbox", { name: "Message" }).press("Enter");
    await expect(bubble(page, "Scout is ready")).toBeVisible();
    await page.getByRole("link", { name: /Scout/ }).first().click();
    await expect(page.getByRole("heading", { name: "Scout" })).toBeVisible();
    await expect(bubble(page, "Hello, I am your new bot")).toBeVisible();
    const scoutId = new URL(page.url()).pathname.split("/").pop()!;
    const given = await page.request.patch(`/api/bots/${scoutId}`, {
      data: { hasComputer: true },
    });
    expect(given.ok()).toBe(true);
    await page.getByRole("textbox", { name: "Message" }).fill("call yourself something new");
    await page.getByRole("textbox", { name: "Message" }).press("Enter");
    await expect(bubble(page, "I am Pip now")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Pip" })).toBeVisible();
    await page.getByRole("main").getByRole("button", { name: "Bot settings" }).click();
    await expect(page.getByLabel("Name")).toHaveValue("Pip");
    await expect(page.getByLabel("Description")).toHaveValue("Keeps you company.");
  });

  test("a bot that does not exist sends the person back to the main bot", async ({ page }) => {
    await registerBotPerson(page, "bot-stranger", "Stranger");
    await page.goto("/bot/00000000-0000-4000-8000-000000000000");
    await expect(page).toHaveURL(/\/bot$/);
    await expect(page.getByRole("link", { name: "Aven, main bot" })).toBeVisible();
  });

  test("a person with no model is told why nothing was sent", async ({ page }) => {
    await registerBotPerson(page, "bot-none", "No Model");
    await page.goto("/bot");
    await page.getByRole("textbox", { name: "Message" }).fill("hello?");
    await page.getByRole("textbox", { name: "Message" }).press("Enter");
    await expect(page.getByText("Could not send message")).toBeVisible();
    await revealToast(page, "ANTHROPIC_API_KEY is not set");
    await expect(page.getByText("ANTHROPIC_API_KEY is not set")).toBeVisible();
  });

  test("the person changes the bot's name and instruction", async ({ page }) => {
    await registerBotPerson(page, "bot-edit", "Bot Editor");
    await page.goto("/bot");
    await page.getByRole("button", { name: "Bot settings" }).click();
    await page.getByLabel("Name").fill("Pip");
    await page.getByLabel("Instruction").fill("Talk like a pirate.");
    await page.getByRole("button", { name: "Save changes" }).click();

    await expect(page.getByText("Bot saved")).toBeVisible();
    await expect(page.getByRole("link", { name: "Pip, main bot" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Message" }).locator("p")).toHaveAttribute(
      "data-placeholder",
      /^Message Pip, /,
    );

    await page.reload();
    await expect(page.getByRole("link", { name: "Pip, main bot" })).toBeVisible();
    await page.getByRole("button", { name: "Bot settings" }).click();
    await expect(page.getByLabel("Instruction")).toHaveValue("Talk like a pirate.");
  });

  test("a bot has a character of its own, and the person picks another", async ({ page }) => {
    await registerBotPerson(page, "bot-look", "Bot Looker");
    await page.goto("/bot");
    const look = page.locator('a[aria-label="Aven, main bot"] canvas[data-family]');
    await expect(look).toBeVisible();
    const family = await look.getAttribute("data-family");
    const color = await look.getAttribute("data-color");
    expect(color).toMatch(/^#[0-9a-f]{6}$/i);
    const shape = family === "hexagon" ? "square" : "hexagon";
    const paint = color?.toLowerCase() === "#ff6a00" ? "#00b2ff" : "#ff6a00";

    await page.reload();
    await expect(look).toHaveAttribute("data-family", family!);
    await expect(look).toHaveAttribute("data-color", color!);

    await page.getByRole("button", { name: "Bot settings" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Change avatar" }).click();
    await page.getByRole("group", { name: "Shape" }).getByRole("button", { name: shape }).click();
    await page.getByRole("button", { name: `Color ${paint}` }).click();
    const preview = dialog
      .getByRole("button", { name: "Change avatar" })
      .locator("canvas[data-family]");
    await expect(preview).toHaveAttribute("data-family", shape);
    await expect(preview).toHaveAttribute("data-color", paint);
    await expect(look).toHaveAttribute("data-family", family!);

    await page.keyboard.press("Escape");
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Bot saved")).toBeVisible();
    await expect(look).toHaveAttribute("data-family", shape);
    await expect(look).toHaveAttribute("data-color", paint);

    await page.reload();
    await expect(look).toHaveAttribute("data-family", shape);
    await page.getByRole("button", { name: "Bot settings" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Change avatar" }).click();
    await expect(
      page.getByRole("group", { name: "Shape" }).getByRole("button", { name: shape }),
    ).toHaveAttribute("aria-pressed", "true");

    await page.getByRole("tab", { name: "Generate" }).click();
    await page.getByRole("button", { name: "Character 1", exact: true }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("group", { name: "Characters" })).toBeHidden();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    await page.reload();
    await expect(look).toHaveAttribute("data-family", shape);
    await expect(look).toHaveAttribute("data-color", paint);

    await page.getByRole("button", { name: "Bot settings" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Change avatar" }).click();
    await page.getByRole("button", { name: "Reset" }).click();
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").getByRole("button", { name: "Save changes" }).click();
    await expect(look).toHaveAttribute("data-family", family!);
    await expect(look).toHaveAttribute("data-color", color!);
  });

  test("the person chooses the model a bot talks with", async ({ page }) => {
    await registerBotPerson(page, "bot-model", "Model Chooser");
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

    await page.reload();
    await expect(model).toContainText("fake-model");
    await page.goto("/bot");
    await page.getByRole("textbox", { name: "Message" }).fill("which model?");
    await page.getByRole("textbox", { name: "Message" }).press("Enter");
    await expect(bubble(page, "You said: which model?")).toBeVisible();

    await page.goto("/settings/bots");
    await model.click();
    await page.getByRole("button", { name: "Use my default model" }).click();
    await expect(model).toContainText("Default model");
  });

  test("with no provider there is no model to choose", async ({ page }) => {
    await registerBotPerson(page, "bot-model-none", "No Provider");
    await page.goto("/settings/bots");
    await expect(page.getByText("Your main bot")).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Add a provider to choose a model" }),
    ).toBeVisible();
  });

  test("the person sets how hard the bot's model thinks", async ({ page }) => {
    await registerBotPerson(page, "bot-effort", "Effort Setter");
    const provider = await page.request.post("/api/providers", {
      data: { kind: "openai", name: "OpenAI", apiKey: "sk-test-1234", modelId: "gpt-5" },
    });
    expect(provider.ok()).toBe(true);
    await page.route("**/api/providers/*/models", (route) =>
      route.fulfill({
        json: {
          models: ["gpt-5"],
          efforts: {
            "gpt-5": { options: ["minimal", "low", "medium", "high"], defaultValue: "medium" },
          },
        },
      }),
    );

    await page.goto("/settings/bots");
    await expect(page.getByText("Choose a model above to set how hard it thinks.")).toBeVisible();

    await page.getByRole("button", { name: "Model of Aven" }).click();
    await page.getByRole("option", { name: "gpt-5" }).click();
    const effort = page.getByRole("group", { name: "Reasoning effort" });
    await expect(effort).toBeVisible();
    await expect(effort.getByRole("button", { name: "Medium" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await effort.getByRole("button", { name: "High" }).click();
    await expect(effort.getByRole("button", { name: "High" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect
      .poll(async () => {
        const bots = (await (await page.request.get("/api/bots")).json()) as {
          reasoningEffort: string | null;
        }[];
        return bots[0]?.reasoningEffort;
      })
      .toBe("high");

    await page.reload();
    await expect(
      page.getByRole("group", { name: "Reasoning effort" }).getByRole("button", { name: "High" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  test("the person sets the size past which the chat is summarized", async ({ page }) => {
    await registerBotPerson(page, "bot-compact", "Compaction Setter");
    await page.goto("/settings/bots");
    const field = page.getByRole("spinbutton", { name: /Summarize the chat of Aven/ });
    await expect(field).toHaveValue("");

    await field.fill("50000");
    await field.press("Enter");
    await expect(page.getByText("Bot saved")).toBeVisible();
    const size = async () =>
      (
        (await (await page.request.get("/api/bots")).json()) as {
          compactAfterTokens: number | null;
        }[]
      )[0]?.compactAfterTokens;
    expect(await size()).toBe(50000);

    await page.reload();
    await expect(field).toHaveValue("50000");

    await field.fill("10");
    await field.press("Enter");
    await revealToast(page, /Use a whole number of tokens from 1,000/);
    await expect(page.getByText(/Use a whole number of tokens from 1,000/)).toBeVisible();
    await expect(field).toHaveValue("50000");
    expect(await size()).toBe(50000);

    await field.fill("");
    await field.press("Enter");
    await expect.poll(size).toBeNull();
  });

  test("on a phone the chat fits the screen, composer included", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await registerBotPerson(page, "bot-phone", "Phone Person");
    await page.goto("/bot");
    await expect(page.getByRole("textbox", { name: "Message" })).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(
      800,
    );
  });

  test("a message of several lines moves the input above the buttons, and back when it is sent", async ({
    page,
  }) => {
    await registerBotPerson(page, "bot-multiline", "Multiline Person");
    await page.getByRole("link", { name: "Bot", exact: true }).click();
    await expect(page).toHaveURL(/\/bot$/);

    const input = page.getByRole("textbox", { name: "Message" });
    const send = page.getByRole("button", { name: "Send" });
    const top = async (locator: typeof input) => (await locator.boundingBox())!.y;

    await input.fill("one line");
    expect(Math.abs((await top(input)) - (await top(send)))).toBeLessThan(20);

    await input.press("Shift+Enter");
    await input.pressSequentially("second line");
    await expect.poll(async () => (await top(send)) - (await top(input))).toBeGreaterThan(30);

    await input.press("ControlOrMeta+a");
    await input.press("Backspace");
    await expect
      .poll(async () => Math.abs((await top(input)) - (await top(send))))
      .toBeLessThan(20);
  });
});
