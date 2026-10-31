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

  // The main bot makes a bot when asked (decision 0060): it shows in the sidebar, has a chat of
  // its own, and a person's other bots do not make bots.
  test("the main bot makes a new bot when asked, and it has a chat of its own", async ({
    page,
  }) => {
    await registerUser(page, "bot-maker", "Maker Person");
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
    await expect(page.getByRole("link", { name: "Scout" })).toBeHidden();
    await page.getByRole("textbox", { name: "Message" }).fill("make a bot for research");
    await page.getByRole("textbox", { name: "Message" }).press("Enter");
    await expect(bubble(page, "Scout is ready")).toBeVisible();

    // It is in the sidebar once the reply is over, under the main bot, and opens on its own page.
    const scout = page.getByRole("link", { name: /Scout/ });
    await expect(scout).toBeVisible();
    await expect(scout).toContainText("Researches what you ask.");
    await scout.click();
    await expect(page).toHaveURL(/\/bot\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { name: "Scout" })).toBeVisible();
    await expect(page.getByText("Say hello to Scout.")).toBeVisible();

    // Its chat is its own: it answers, and the main bot's words are not in it.
    await page.getByRole("textbox", { name: "Message" }).fill("hello scout");
    await page.getByRole("textbox", { name: "Message" }).press("Enter");
    await expect(bubble(page, "You said: hello scout")).toBeVisible();
    await expect(bubble(page, "Scout is ready")).toBeHidden();

    // It stays after a reload, and the main bot is still the one at /bot.
    await page.reload();
    await expect(page.getByRole("heading", { name: "Scout" })).toBeVisible();
    await page.getByRole("link", { name: "Aven, main bot" }).click();
    await expect(page).toHaveURL(/\/bot$/);
    await expect(bubble(page, "Scout is ready")).toBeVisible();

    // What the main bot wrote is what was made: the person's own bot, on their default model.
    const [, scoutRow] = await (await page.request.get("/api/bots")).json();
    expect(scoutRow).toMatchObject({
      name: "Scout",
      avatar: "",
      isMain: false,
      providerId: null,
      description: "Researches what you ask.",
      instruction: "You research what the person asks and report what you found.",
    });
  });

  // A bot changes itself when asked (decision 0061): the main bot and one it made alike.
  test("a bot renames itself and writes its own description when asked", async ({ page }) => {
    // Three replies, each waiting out its typing pauses.
    test.slow();
    await page.setViewportSize({ width: 1400, height: 800 });
    await registerUser(page, "bot-self", "Self Person");
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

    // The page picks the change up when the reply is over: the tile, the header, the placeholder.
    await expect(page.getByRole("link", { name: "Pip, main bot" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Pip" })).toBeVisible();
    await expect(page.getByText("Keeps you company.")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Message" })).toHaveAttribute(
      "placeholder",
      "Message Pip",
    );

    // It is the person's to see and change too: the description is in the bot's settings.
    await page.getByRole("button", { name: "Bot settings" }).click();
    await expect(page.getByLabel("Description")).toHaveValue("Keeps you company.");
    await page.getByLabel("Description").fill("Your pal at the keyboard.");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Your pal at the keyboard.")).toBeVisible();

    // A bot the main bot made changes itself the same way, and has its settings in its header.
    await page.getByRole("textbox", { name: "Message" }).fill("make a bot for research");
    await page.getByRole("textbox", { name: "Message" }).press("Enter");
    await expect(bubble(page, "Scout is ready")).toBeVisible();
    await page.getByRole("link", { name: /Scout/ }).click();
    await expect(page.getByText("Say hello to Scout.")).toBeVisible();
    await page.getByRole("textbox", { name: "Message" }).fill("call yourself something new");
    await page.getByRole("textbox", { name: "Message" }).press("Enter");
    await expect(bubble(page, "I am Pip now")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Pip" })).toBeVisible();
    await page.getByRole("main").getByRole("button", { name: "Bot settings" }).click();
    await expect(page.getByLabel("Name")).toHaveValue("Pip");
    await expect(page.getByLabel("Description")).toHaveValue("Keeps you company.");
  });

  test("a bot that does not exist sends the person back to the main bot", async ({ page }) => {
    await registerUser(page, "bot-stranger", "Stranger");
    await page.goto("/bot/00000000-0000-4000-8000-000000000000");
    await expect(page).toHaveURL(/\/bot$/);
    await expect(page.getByRole("link", { name: "Aven, main bot" })).toBeVisible();
  });

  test("a person with no model is told why nothing was sent", async ({ page }) => {
    await registerUser(page, "bot-none", "No Model");
    await page.goto("/bot");
    await page.getByRole("textbox", { name: "Message" }).fill("hello?");
    await page.getByRole("textbox", { name: "Message" }).press("Enter");
    await expect(page.getByText("Could not send message")).toBeVisible();
    await expect(page.getByText("ANTHROPIC_API_KEY is not set")).toBeVisible();
  });

  test("the person changes the bot's name and instruction", async ({ page }) => {
    await registerUser(page, "bot-edit", "Bot Editor");
    await page.goto("/bot");
    await page.getByRole("button", { name: "Bot settings" }).click();
    await page.getByLabel("Name").fill("Pip");
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
  });

  // A bot's avatar (decision 0062): it has a character from the start, drawn from its id, and the
  // person can pick another.
  test("a bot has a character of its own, and the person picks another", async ({ page }) => {
    await registerUser(page, "bot-look", "Bot Looker");
    await page.goto("/bot");
    // By its label, not its role: an open dialog hides the page behind it from role queries.
    const look = page.locator('a[aria-label="Aven, main bot"] svg[data-family]');
    await expect(look).toBeVisible();
    const family = await look.getAttribute("data-family");
    const color = await look.getAttribute("data-color");
    expect(color).toMatch(/^#[0-9a-f]{6}$/i);

    // The same bot looks the same on the next visit, without anything having been saved.
    await page.reload();
    await expect(look).toHaveAttribute("data-family", family!);
    await expect(look).toHaveAttribute("data-color", color!);

    await page.getByRole("button", { name: "Bot settings" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Change avatar" }).click();
    await page
      .getByRole("group", { name: "Shape" })
      .getByRole("button", { name: "hexagon" })
      .click();
    await page.getByRole("button", { name: "Color #ff7a00" }).click();
    // The avatar in the dialog changes before anything is saved.
    const preview = dialog
      .getByRole("button", { name: "Change avatar" })
      .locator("svg[data-family]");
    await expect(preview).toHaveAttribute("data-family", "hexagon");
    await expect(preview).toHaveAttribute("data-color", "#ff7a00");
    await expect(look).toHaveAttribute("data-family", family!);

    await page.keyboard.press("Escape");
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Bot saved")).toBeVisible();
    await expect(look).toHaveAttribute("data-family", "hexagon");
    await expect(look).toHaveAttribute("data-color", "#ff7a00");

    // It is kept, and the picker opens on it.
    await page.reload();
    await expect(look).toHaveAttribute("data-family", "hexagon");
    await page.getByRole("button", { name: "Bot settings" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Change avatar" }).click();
    await expect(
      page.getByRole("group", { name: "Shape" }).getByRole("button", { name: "hexagon" }),
    ).toHaveAttribute("aria-pressed", "true");

    // Generate offers characters to choose from; closing without saving keeps what was kept.
    await page.getByRole("tab", { name: "Generate" }).click();
    await page.getByRole("button", { name: "Use this character" }).first().click();
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await expect(look).toHaveAttribute("data-family", "hexagon");

    // Reset goes back to the character the bot's id draws.
    await page.getByRole("button", { name: "Bot settings" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Change avatar" }).click();
    await page.getByRole("button", { name: "Reset" }).click();
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").getByRole("button", { name: "Save changes" }).click();
    await expect(look).toHaveAttribute("data-family", family!);
    await expect(look).toHaveAttribute("data-color", color!);
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

  test("the person sets how hard the bot's model thinks", async ({ page }) => {
    await registerUser(page, "bot-effort", "Effort Setter");
    // The listing of a real OpenAI key is out of reach here; the server still checks the effort
    // against what the SDK knows of gpt-5.
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
    // On the default model there is nothing to set yet.
    await expect(page.getByText("Choose a model above to set how hard it thinks.")).toBeVisible();

    await page.getByRole("button", { name: "Model of Aven" }).click();
    await page.getByRole("option", { name: "gpt-5" }).click();
    const slider = page.getByRole("slider", { name: "Reasoning effort" });
    await expect(slider).toBeVisible();
    await expect(slider).toHaveAttribute("aria-valuetext", "medium");

    await slider.focus();
    await slider.press("End");
    await expect(slider).toHaveAttribute("aria-valuetext", "high");
    await expect
      .poll(async () => {
        const bots = (await (await page.request.get("/api/bots")).json()) as {
          reasoningEffort: string | null;
        }[];
        return bots[0]?.reasoningEffort;
      })
      .toBe("high");

    await page.reload();
    await expect(page.getByRole("slider", { name: "Reasoning effort" })).toHaveAttribute(
      "aria-valuetext",
      "high",
    );
  });

  test("the person sets the size past which the chat is summarized", async ({ page }) => {
    await registerUser(page, "bot-compact", "Compaction Setter");
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

    // Too small is told in words and not saved; empty goes back to the model's own.
    await field.fill("10");
    await field.press("Enter");
    await expect(page.getByText(/Use a whole number of tokens from 1,000/)).toBeVisible();
    await expect(field).toHaveValue("50000");
    expect(await size()).toBe(50000);

    await field.fill("");
    await field.press("Enter");
    await expect.poll(size).toBeNull();
  });

  // The bot's computer (decision 0059): its desktop is the thread's own panel, beside the chat. It is off until it is woken, since a bot that only talks never starts one.
  test("the person wakes the bot's computer and watches and takes over its desktop", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1400, height: 800 });
    await registerUser(page, "bot-computer", "Computer Person");
    await page.goto("/bot");

    await page.getByRole("button", { name: "Desktop", exact: true }).click();
    const desktop = page.getByRole("region", { name: "Desktop" });
    await expect(desktop.getByText("The bot's computer is not running.")).toBeVisible();
    await expect(desktop.locator("canvas")).toHaveCount(0);

    await desktop.getByRole("button", { name: "Wake up" }).click();
    const canvas = desktop.locator("canvas");
    await expect(canvas).toBeVisible();
    await expect(async () => {
      const pixel = await canvas.evaluate((element) => {
        const context = (element as HTMLCanvasElement).getContext("2d")!;
        return Array.from(context.getImageData(10, 10, 1, 1).data);
      });
      expect(pixel).toEqual([255, 0, 0, 255]);
    }).toPass({ timeout: 10_000 });

    // Watching first; taking over is the person's to ask for.
    await expect(desktop.getByText("Watching. Take over to click and type.")).toBeVisible();
    await desktop.getByRole("button", { name: "Take over" }).click();
    await expect(
      desktop.getByText("You are in control. The agent's inputs are paused."),
    ).toBeVisible();
    await desktop.getByRole("button", { name: "Give back" }).click();

    // What is open is remembered, and the chat is still there beside it.
    await page.reload();
    await expect(page.getByRole("region", { name: "Desktop" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible();

    await page.getByRole("button", { name: "Close desktop" }).click();
    await expect(page.getByRole("region", { name: "Desktop" })).toBeHidden();
  });

  test("on a phone the chat fits the screen, composer included", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await registerUser(page, "bot-phone", "Phone Person");
    await page.goto("/bot");
    await expect(page.getByRole("textbox", { name: "Message" })).toBeInViewport({ ratio: 1 });
    // The shell's top bar and the chat together are the screen: the page itself does not scroll.
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(
      800,
    );
  });
});
