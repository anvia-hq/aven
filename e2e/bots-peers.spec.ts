import { expect, test, type Page } from "@playwright/test";

import type { ChildProcess } from "node:child_process";

import { registerBotPerson, threadOnFakeRunner } from "./helpers";

const PIXEL =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==";

const bubble = (page: Page, text: string) =>
  page
    .locator('[data-slot="bubble-content"], [data-role="user"]')
    .filter({ hasText: new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) });

test.describe("bots peers and uploads", () => {
  test("a person sends a bot files and an image, and the bot is told where they are", async ({
    page,
  }) => {
    test.slow();
    await registerBotPerson(page, "bot-files", "Files Person");
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
    await page.locator('input[type="file"]').setInputFiles([
      { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("remember the milk") },
      { name: "pixel.png", mimeType: "image/png", buffer: Buffer.from(PIXEL, "base64") },
    ]);
    await expect(page.getByRole("button", { name: "Remove notes.txt" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Remove pixel.png" })).toBeVisible();

    await page.getByRole("textbox", { name: "Message" }).fill("look at these");
    await page.getByRole("textbox", { name: "Message" }).press("Enter");

    await expect(bubble(page, "look at these")).toBeVisible();
    await expect(page.getByRole("button", { name: "Remove notes.txt" })).toBeHidden();
    await expect(page.getByText("notes.txt", { exact: true })).toBeVisible();
    const image = page.getByRole("img", { name: "pixel.png" });
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1);

    await expect(bubble(page, "Hey there!")).toBeVisible();
    const heard = page
      .locator('[data-slot="bubble-content"], [data-role="user"]')
      .filter({ hasText: "You said:" });
    await expect(heard).toContainText("look at these");
    await expect(heard).toContainText("/uploads/notes.txt");
    await expect(heard).toContainText("/uploads/pixel.png");
    await expect(heard).toContainText("shown to you below");

    await page.reload();
    await expect(bubble(page, "look at these")).toBeVisible();
    await expect(page.getByText("notes.txt", { exact: true })).toBeVisible();
    const again = page.getByRole("img", { name: "pixel.png" });
    await expect(again).toBeVisible();
    await expect.poll(() => again.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1);
    await expect(page.getByText("The user attached 2 files")).toHaveCount(1);
  });

  test("files alone make a message: it stays as one attachment, the bot answers it and the composer empties", async ({
    page,
  }) => {
    test.slow();
    await registerBotPerson(page, "bot-files-only", "Files Only");
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
    const send = page.getByRole("button", { name: "Send", exact: true });
    await expect(send).toBeDisabled();
    await page
      .locator('input[type="file"]')
      .setInputFiles([
        { name: "plan.md", mimeType: "text/markdown", buffer: Buffer.from("# plan") },
      ]);
    await expect(send).toBeEnabled();
    await send.click();
    await expect(page.getByText("Hey there!")).toBeVisible();
    await expect(page.getByText("plan.md", { exact: true })).toHaveCount(1);
    await expect(send).toBeDisabled();
  });

  test("the main bot makes a new bot when asked, and it has a chat of its own", async ({
    page,
  }) => {
    test.slow();
    await registerBotPerson(page, "bot-maker", "Maker Person");
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

    const scout = page
      .getByRole("link", { name: /Scout/ })
      .filter({ hasText: "Researches what you ask." });
    await expect(scout).toBeVisible();
    await scout.click();
    await expect(page).toHaveURL(/\/bot\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { name: "Scout" })).toBeVisible();
    await expect(bubble(page, "Hello, I am your new bot")).toBeVisible();
    await expect(page.getByText("You were just created")).toHaveCount(0);

    await page.getByRole("textbox", { name: "Message" }).fill("hello scout");
    await page.getByRole("textbox", { name: "Message" }).press("Enter");
    await expect(bubble(page, "You said: hello scout")).toBeVisible();
    await expect(bubble(page, "Scout is ready")).toBeHidden();

    await page.reload();
    await expect(page.getByRole("heading", { name: "Scout" })).toBeVisible();
    await page.getByRole("link", { name: "Aven, main bot" }).click();
    await expect(page).toHaveURL(/\/bot$/);
    await expect(bubble(page, "Scout is ready")).toBeVisible();

    const allBots = (await (await page.request.get("/api/bots")).json()) as { name: string }[];
    const scoutRow = allBots.find((bot) => bot.name === "Scout");
    expect(scoutRow).toMatchObject({
      name: "Scout",
      avatar: "",
      isMain: false,
      providerId: null,
      description: "Researches what you ask.",
      instruction: "You research what the person asks and report what you found.",
    });
  });

  test("the person mentions a bot and the main bot asks it and tells what it said", async ({
    page,
  }) => {
    test.slow();
    await registerBotPerson(page, "bot-mention", "Mention Person");
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
    await message.fill("make a bot for research");
    await message.press("Enter");
    await expect(bubble(page, "Scout is ready")).toBeVisible();

    await page.getByRole("link", { name: /Scout/ }).first().click();
    await expect(page.getByRole("heading", { name: "Scout" })).toBeVisible();
    await expect(bubble(page, "Hello, I am your new bot")).toBeVisible();
    await expect(page.getByRole("status", { name: /typing/ })).toBeHidden();
    await page.getByRole("link", { name: "Aven, main bot" }).click();
    await expect(page.getByRole("heading", { name: "Aven" })).toBeVisible();
    await expect(bubble(page, "Scout is ready")).toBeVisible();

    await message.click();
    await page.keyboard.type("Ask @Sco");
    const menu = page.getByRole("listbox", { name: "Mention" });
    await expect(menu.getByRole("option", { name: /Scout/ })).toBeVisible();
    await expect(menu.getByRole("option", { name: /Aven/ })).toHaveCount(0);
    await page.keyboard.press("Enter");
    await expect(message.locator('[data-mention="bot"]')).toHaveText("Scout");
    await page.keyboard.type(" to do A, B and C");
    await page.keyboard.press("Enter");

    const sent = page
      .locator('[data-slot="bubble-content"], [data-role="user"]')
      .filter({ hasText: "to do A, B and C" });
    await expect(sent.locator('[data-mention="bot"]')).toHaveText("Scout");
    await expect(bubble(page, "I asked Scout")).toBeVisible();
    await expect(message).toHaveText("");
    await expect(page.locator('a[href^="/bot/"] canvas[data-mood]')).toHaveAttribute(
      "data-mood",
      "working",
    );

    await expect(bubble(page, "Scout answered")).toBeVisible();
    await expect(page.locator('a[href^="/bot/"] canvas[data-mood="idle"]').first()).toBeVisible();

    const activity = page.locator('[data-activity="bots"]');
    await expect(activity).toContainText("2 messages with");
    await expect(activity).toContainText("Scout");
    await expect(bubble(page, "A, B and C")).toHaveCount(0);
    await activity.getByRole("button").click();
    await expect(activity).toContainText("Aven → Scout A, B and C");
    await expect(activity).toContainText("Scout → Aven You said: [from main] A, B and C");

    await page.getByRole("link", { name: /Scout/ }).first().click();
    await expect(page.getByRole("heading", { name: "Scout" })).toBeVisible();
    await expect(bubble(page, "Hello, I am your new bot")).toBeVisible();
    await expect(activity).toContainText("2 messages with");
    await expect(activity).toContainText("Aven");
    await activity.getByRole("button").click();
    await expect(activity).toContainText("Aven → Scout A, B and C");
    await expect(activity).toContainText("Scout → Aven You said: [from main] A, B and C");

    await expect(page.getByRole("textbox", { name: "Message" }).locator("p")).toHaveAttribute(
      "data-placeholder",
      /@ to mention a bot or thread/,
    );
    await page.getByRole("textbox", { name: "Message" }).click();
    await page.keyboard.type("@Av");
    await expect(page.getByRole("textbox", { name: "Message" })).toContainText("@Av");
    const menuHere = page.getByRole("listbox", { name: "Mention" });
    await expect(menuHere.getByRole("option", { name: /Aven/ })).toBeVisible();
    await page.keyboard.press("Control+A");
    await page.keyboard.press("Backspace");

    await page.reload();
    await expect(bubble(page, "Hello, I am your new bot")).toBeVisible();
    await expect(activity).toContainText("2 messages with");
    await activity.getByRole("button").click();
    await expect(activity).toContainText("Aven → Scout A, B and C");
  });

  test("a / in the bot chat offers the skills and puts the picked one in the message as a chip", async ({
    page,
  }) => {
    await registerBotPerson(page, "bot-skill-mention", "Skill Mention Person");
    await page.goto("/bot");
    const message = page.getByRole("textbox", { name: "Message" });
    await message.click();
    await page.keyboard.type("/setup-s");
    const menu = page.getByRole("listbox", { name: "Mention" });
    await expect(menu.getByRole("option", { name: /setup-ship/ })).toBeVisible();
    await expect(menu.getByRole("option", { name: /setup-actions/ })).toHaveCount(0);
    await page.keyboard.press("Enter");
    await expect(message.locator('[data-mention="skill"]')).toHaveText("setup-ship");
  });

  test("the person mentions a thread, and it goes to the bot with its id and shows as a chip that opens it", async ({
    page,
  }) => {
    let runner: ChildProcess | undefined;
    try {
      await registerBotPerson(page, "bot-thread-mention", "Thread Mention Person");
      const provider = await page.request.post("/api/providers", {
        data: {
          kind: "openai-compatible",
          name: "Fake",
          baseUrl: "http://localhost:8102/v1",
          modelId: "fake-model",
        },
      });
      expect(provider.ok()).toBe(true);
      const { child, threadId } = await threadOnFakeRunner(page);
      runner = child;
      const renamed = await page.request.patch(`/api/threads/${threadId}`, {
        data: { title: "Fix the export button" },
      });
      expect(renamed.ok()).toBe(true);

      const setState = (state: string) =>
        page.request.patch(`/api/threads/${threadId}`, { data: { state } });
      expect((await setState("archived")).ok()).toBe(true);
      await page.goto("/bot");
      const message = page.getByRole("textbox", { name: "Message" });
      await message.click();
      await page.keyboard.type("@export");
      const menu = page.getByRole("listbox", { name: "Mention" });
      await expect(menu.getByRole("option", { name: /Fix the export button/ })).toHaveCount(0);
      expect((await setState("open")).ok()).toBe(true);

      await page.goto("/bot");
      await message.click();
      await page.keyboard.type("How is @export");
      await expect(menu.getByRole("option", { name: /Fix the export button/ })).toBeVisible();
      await page.keyboard.press("Enter");
      await expect(message.locator('[data-mention="thread"]')).toHaveText("Fix the export button");
      await page.keyboard.type(" going?");
      await page.keyboard.press("Enter");

      const sent = page
        .locator('[data-slot="bubble-content"], [data-role="user"]')
        .filter({ hasText: "going?" });
      const chip = sent.locator('[data-mention="thread"]');
      await expect(chip).toHaveText("Fix the export button");
      await expect(chip).toHaveAttribute("href", `/threads/${threadId}`);
      await expect(sent).not.toContainText("thread:");
      await expect(message).toHaveText("");

      await page.reload();
      await expect(
        page.locator('[data-mention="thread"]').filter({ hasText: "Fix the export button" }),
      ).toBeVisible();
    } finally {
      runner?.kill();
    }
  });

  test("a bot asks the person to decide, and hears the answer", async ({ page }) => {
    await registerBotPerson(page, "bot-question", "Question Person");
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
    await message.fill("I need a decision from you");
    await message.press("Enter");

    const card = page.getByRole("form", { name: "Answer Aven" });
    await expect(card.getByText("Which should I start with?").first()).toBeVisible();
    await card.getByRole("radio", { name: "Analyst" }).check();
    await card.getByRole("button", { name: "Send answer" }).click();

    await expect(bubble(page, "Analyst").first()).toBeVisible();
    await expect(bubble(page, "You said: Analyst")).toBeVisible();
    await expect(card).toHaveCount(0);

    await page.reload();
    await expect(bubble(page, "Which should I start with?")).toBeVisible();
    await expect(page.getByRole("form", { name: "Answer Aven" })).toHaveCount(0);
  });

  test("a bot schedules a task when asked, and the person can see and pause it", async ({
    page,
  }) => {
    await registerBotPerson(page, "bot-schedule", "Schedule Person");
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
    await message.fill("every morning tell me the news");
    await message.press("Enter");
    await expect(bubble(page, "Scheduled: Morning news")).toBeVisible();

    const preferences = await (await page.request.get("/api/preferences")).json();
    expect(preferences.timezone).toBeTruthy();
    const schedules = await (await page.request.get("/api/schedules")).json();
    expect(schedules).toHaveLength(1);
    expect(schedules[0]).toMatchObject({
      bot: "main",
      name: "Morning news",
      cron: "0 7 * * *",
      timezone: preferences.timezone,
      enabled: true,
    });
    expect(schedules[0].nextRun).toBeTruthy();

    const paused = await page.request.patch(`/api/schedules/${schedules[0].id}`, {
      data: { enabled: false },
    });
    expect(paused.ok()).toBe(true);
    expect((await paused.json()).nextRun).toBeNull();

    await page.goto("/settings/general");
    await page.getByRole("combobox", { name: "Timezone" }).click();
    await page.getByRole("option", { name: "Asia/Jakarta" }).click();
    await expect(page.getByText("Timezone saved")).toBeVisible();
    expect((await (await page.request.get("/api/preferences")).json()).timezone).toBe(
      "Asia/Jakarta",
    );
  });

  test("a bot starts a goal when asked and works it on its own until it is done", async ({
    page,
  }) => {
    test.slow();
    await registerBotPerson(page, "bot-goal", "Goal Person");
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
    await message.fill("start a goal to write the report");
    await message.press("Enter");

    await expect(bubble(page, "Working on it in the background")).toBeVisible();
    await expect(bubble(page, "Goal finished: the report is written")).toBeVisible();
    await expect(page.getByText("Goal round")).toHaveCount(0);
  });
});
