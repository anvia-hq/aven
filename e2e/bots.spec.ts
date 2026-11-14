import { expect, test, type Page } from "@playwright/test";

import type { ChildProcess } from "node:child_process";

import { registerUser, threadOnFakeRunner } from "./helpers";

const PIXEL =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==";

const bubble = (page: Page, text: string) =>
  page
    .locator('[data-slot="bubble-content"], [data-role="user"]')
    .filter({ hasText: new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) });

test.describe("bots", () => {
  test("bubbles in a row of one speaker lose the rounding of their left side where they touch", async ({
    page,
  }) => {
    await registerUser(page, "corners", "Corners User");
    const said = (id: string, text: string) => ({ id, role: "bot", text });
    await page.route("**/api/bots/*/events", (route) =>
      route.fulfill({
        contentType: "text/event-stream",
        body: `data: ${JSON.stringify({
          type: "snapshot",
          typing: false,
          messages: [said("m-1", "First"), said("m-2", "Middle"), said("m-3", "Last")],
        })}\n\n`,
      }),
    );
    await page.getByRole("link", { name: "Bot", exact: true }).click();
    await expect(page).toHaveURL(/\/bot$/);
    const radius = async (text: string) =>
      bubble(page, text).evaluate((node) => {
        const style = getComputedStyle(node);
        return {
          topLeft: Number.parseFloat(style.borderTopLeftRadius),
          bottomLeft: Number.parseFloat(style.borderBottomLeftRadius),
        };
      });
    const first = await radius("First");
    const middle = await radius("Middle");
    const last = await radius("Last");
    expect(first.topLeft).toBeGreaterThan(middle.topLeft);
    expect(first.bottomLeft).toBe(middle.bottomLeft);
    expect(middle.topLeft).toBe(middle.bottomLeft);
    expect(last.topLeft).toBe(middle.topLeft);
    expect(last.bottomLeft).toBe(first.topLeft);
    expect(first.bottomLeft).toBeLessThan(first.topLeft);
  });

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
    await expect(bubble(page, "Hello, I am your new bot")).toBeVisible();
    await expect(page.getByText("You were just created")).toHaveCount(0);
    await expect(page.getByRole("status", { name: /typing/ })).toBeHidden();

    const phrase = "hello bot";
    const held = await page.request.post("http://localhost:8102/e2e/hold", {
      data: { phrase },
    });
    expect(held.ok()).toBe(true);

    const tile = page.locator('a[aria-label="Aven, main bot"] svg[data-mood]');
    const typing = page.locator('[role="status"] svg[data-mood]');

    try {
      await page.getByRole("textbox", { name: "Message" }).fill(phrase);
      await page.getByRole("textbox", { name: "Message" }).press("Enter");
      await expect(bubble(page, phrase)).toBeVisible();
      await expect(typing).toHaveAttribute("data-mood", "working");
      await expect(tile).toHaveAttribute("data-mood", "working");
      expect(await bubble(page, "Hey there!").count()).toBe(0);
    } finally {
      await page.request.post("http://localhost:8102/e2e/release", { data: { phrase } });
    }

    await expect(bubble(page, "Hey there!")).toBeVisible();
    await expect(bubble(page, "You said: hello bot")).toBeVisible();
    await expect(typing).toHaveCount(0);
    await expect(tile).toHaveAttribute("data-mood", "idle");

    await expect(page.getByRole("link", { name: "Projects" })).toBeHidden();

    await page.reload();
    await expect(bubble(page, "hello bot")).toBeVisible();
    await expect(bubble(page, "Hey there!")).toBeVisible();
    await expect(bubble(page, "You said: hello bot")).toBeVisible();
  });

  test("a bot sends a file with its message, the chat shows a card, and opening it fills a side panel that survives a reload, with a version for each time it is sent again", async ({
    page,
  }) => {
    await registerUser(page, "bot-file", "File Person");
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
    const box = page.getByRole("textbox", { name: "Message" });
    await box.fill("send the report");
    await box.press("Enter");

    const card = page.locator('[data-role="artifact-card"]');
    await expect(card).toHaveCount(1);
    await expect(card).toContainText("Weekly report");
    await expect(page.locator('[data-role="artifact-panel"]')).toHaveCount(0);

    await card.click();
    const panel = page.locator('[data-role="artifact-panel"]');
    await expect(panel).toBeVisible();
    await expect(panel.getByText("All good in version 1.")).toBeVisible();
    await expect(page).toHaveURL(/artifact=/);

    await page.reload();
    await expect(page.locator('[data-role="artifact-panel"]')).toBeVisible();
    await expect(page.getByText("All good in version 1.")).toBeVisible();

    await page.getByRole("textbox", { name: "Message" }).fill("update the report");
    await page.getByRole("textbox", { name: "Message" }).press("Enter");
    await expect(card).toHaveCount(2);
    await card.last().click();
    await expect(page.getByText("All good in version 2.")).toBeVisible();
    const versions = page.getByRole("combobox", { name: "Version" });
    await expect(versions).toHaveValue(/\.md$/);
    await expect(versions.locator("option")).toHaveCount(2);

    await page.getByRole("button", { name: "Close file" }).click();
    await expect(page.locator('[data-role="artifact-panel"]')).toHaveCount(0);
    await expect(page).not.toHaveURL(/artifact=/);
  });

  test("a bot quotes the message it answers and reacts to it, and the person quotes one too", async ({
    page,
  }) => {
    await registerUser(page, "bot-quote", "Quote Person");
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
    const box = page.getByRole("textbox", { name: "Message" });
    await box.fill("react to my plan");
    await box.press("Enter");

    await expect(
      page.locator('[data-slot="bubble-content"]').filter({ hasText: "Good plan" }),
    ).toBeVisible();
    await expect(page.locator('[data-slot="quote"]')).toContainText("You");
    await expect(page.locator('[data-slot="quote"]')).toContainText("react to my plan");
    await expect(page.getByTitle("Reaction")).toHaveText("👍");

    await bubble(page, "react to my plan").hover();
    await page.getByRole("button", { name: "Quote this message" }).first().click();
    await expect(page.locator('[data-slot="quoting"]')).toContainText("You");
    await expect(page.locator('[data-slot="quoting"]')).toContainText("react to my plan");

    await box.fill("a second thought");
    await box.press("Enter");
    await expect(
      page.locator('[data-role="user"]').filter({ hasText: "a second thought" }),
    ).toBeVisible();
    await expect(page.locator('[data-slot="quoting"]')).toBeHidden();

    await page.reload();
    await expect(page.getByTitle("Reaction")).toHaveText("👍");
    await expect(page.locator('[data-slot="quote"]')).toHaveCount(2);
  });

  test("a bot is told which skills it has", async ({ page }) => {
    await registerUser(page, "bot-skills", "Skills Person");
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
    await page.getByRole("textbox", { name: "Message" }).fill("what are your skills?");
    await page.getByRole("textbox", { name: "Message" }).press("Enter");
    await expect(bubble(page, "I have the aven-help skill")).toBeVisible();
  });

  test("a bot connects an MCP server when asked, and it is on the person's Settings page", async ({
    page,
  }) => {
    await registerUser(page, "bot-mcp", "Mcp Person");
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
    await page
      .getByRole("textbox", { name: "Message" })
      .fill("connect the docs mcp server at https://docs.example.com/mcp");
    await page.getByRole("textbox", { name: "Message" }).press("Enter");
    await expect(bubble(page, "Docs is connected")).toBeVisible();

    await page.goto("/settings/mcp");
    const row = page.getByRole("list", { name: "MCP servers" }).getByRole("listitem");
    await expect(row).toContainText("Docs");
    await expect(row).toContainText("https://docs.example.com/mcp");
    await expect(row).toContainText("Headers: Authorization");
    await expect(page.getByText("given-by-the-person")).toHaveCount(0);
    expect(await (await page.request.get("/api/mcp-servers")).text()).not.toContain(
      "given-by-the-person",
    );
  });

  test("a bot adds a provider and the person gives its key in a masked card, never in the chat", async ({
    page,
  }) => {
    await registerUser(page, "bot-provider", "Provider Person");
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
    await page
      .getByRole("textbox", { name: "Message" })
      .fill("add my azure provider Work Azure at https://work.openai.azure.com");
    await page.getByRole("textbox", { name: "Message" }).press("Enter");

    const key = page.getByLabel("API key for Work Azure", { exact: true });
    await expect(key).toBeVisible();
    await expect(key).toHaveAttribute("type", "password");
    await expect(page.getByText("Azure OpenAI · https://work.openai.azure.com")).toBeVisible();
    const before = (await (await page.request.get("/api/providers")).json()) as {
      name: string;
      hasKey: boolean;
      isDefault: boolean;
    }[];
    expect(before.find((one) => one.name === "Work Azure")).toMatchObject({
      hasKey: false,
      isDefault: false,
    });

    await key.fill("sk-azure-e2e-secret-1234");
    await page.getByRole("button", { name: "Save key" }).click();
    await expect(bubble(page, "Work Azure is ready")).toBeVisible();

    const after = (await (await page.request.get("/api/providers")).json()) as {
      name: string;
      hasKey: boolean;
      keyHint: string;
    }[];
    expect(after.find((one) => one.name === "Work Azure")).toMatchObject({
      hasKey: true,
      keyHint: "1234",
    });
    await expect(page.getByText("sk-azure-e2e-secret")).toHaveCount(0);
    await page.reload();
    await expect(bubble(page, "Work Azure is ready")).toBeVisible();
    await expect(page.getByText("sk-azure-e2e-secret")).toHaveCount(0);

    await page.goto("/settings/providers");
    await expect(page.getByRole("listitem", { name: "Work Azure" })).toContainText(
      "https://work.openai.azure.com · gpt-5 · …1234",
    );
  });

  test.describe("a bot's threads", () => {
    let runner: ChildProcess | undefined;
    test.afterEach(() => {
      runner?.kill();
      runner = undefined;
    });

    test("a bot starts a thread in a project when asked, and archives it when asked", async ({
      page,
    }) => {
      await registerUser(page, "bot-thread", "Thread Person");
      const provider = await page.request.post("/api/providers", {
        data: {
          kind: "openai-compatible",
          name: "Fake",
          baseUrl: "http://localhost:8102/v1",
          modelId: "fake-model",
        },
      });
      expect(provider.ok()).toBe(true);
      const { child, events } = await threadOnFakeRunner(page, { FAKE_RUN_ENDS: "1" });
      runner = child;

      await page.goto("/bot");
      const message = page.getByRole("textbox", { name: "Message" });
      await message.fill("start a thread to fix the e2e build");
      await message.press("Enter");
      await expect(bubble(page, "Started the thread")).toBeVisible();

      await expect
        .poll(() => events.flatMap((event) => (event.type === "started" ? [event.prompt] : [])))
        .toContain("Fix the e2e build");

      await page.goto("/threads");
      const recent = page.getByRole("region", { name: "Recent threads" });
      await expect(recent).toContainText("Fix the e2e build");
      await recent.getByText("Fix the e2e build").click();
      await expect(page).toHaveURL(/\/threads\/[0-9a-f-]{36}$/);
      await expect(page.getByRole("heading", { name: "Fix the e2e build" })).toBeVisible();

      await page.goto("/bot");
      await message.fill("archive the thread Fix the e2e build");
      await message.press("Enter");
      await expect(bubble(page, "Archived the thread")).toBeVisible();

      await page.goto("/threads");
      await expect(page.getByRole("region", { name: "Recent threads" })).not.toContainText(
        "Fix the e2e build",
      );
      const threads = (await (await page.request.get("/api/threads")).json()) as {
        title: string;
        state: string;
      }[];
      expect(threads.find((thread) => thread.title === "Fix the e2e build")?.state).toBe(
        "archived",
      );
    });
  });

  test("a person sends a bot files and an image, and the bot is told where they are", async ({
    page,
  }) => {
    test.slow();
    await registerUser(page, "bot-files", "Files Person");
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
    await registerUser(page, "bot-files-only", "Files Only");
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

    const scout = page.getByRole("link", { name: /Scout/ });
    await expect(scout).toBeVisible();
    await expect(scout).toContainText("Researches what you ask.");
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
    await registerUser(page, "bot-mention", "Mention Person");
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

    await page.getByRole("link", { name: /Scout/ }).click();
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
    await expect(page.locator('a[href^="/bot/"] svg[data-mood]')).toHaveAttribute(
      "data-mood",
      "working",
    );

    await expect(bubble(page, "Scout answered")).toBeVisible();
    await expect(page.locator('a[href^="/bot/"] svg[data-mood="idle"]')).toBeVisible();

    const activity = page.locator('[data-activity="bots"]');
    await expect(activity).toContainText("2 messages with");
    await expect(activity).toContainText("Scout");
    await expect(bubble(page, "A, B and C")).toHaveCount(0);
    await activity.getByRole("button").click();
    await expect(activity).toContainText("Aven → Scout A, B and C");
    await expect(activity).toContainText("Scout → Aven You said: [from main] A, B and C");

    await page.getByRole("link", { name: /Scout/ }).click();
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
    await registerUser(page, "bot-skill-mention", "Skill Mention Person");
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
      await registerUser(page, "bot-thread-mention", "Thread Mention Person");
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
    await registerUser(page, "bot-question", "Question Person");
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
    await registerUser(page, "bot-schedule", "Schedule Person");
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
    await registerUser(page, "bot-goal", "Goal Person");
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

  test("a bot renames itself and writes its own description when asked", async ({ page }) => {
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
    await page.getByRole("link", { name: /Scout/ }).click();
    await expect(page.getByRole("heading", { name: "Scout" })).toBeVisible();
    await expect(bubble(page, "Hello, I am your new bot")).toBeVisible();
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
    await registerUser(page, "bot-look", "Bot Looker");
    await page.goto("/bot");
    const look = page.locator('a[aria-label="Aven, main bot"] svg[data-family]');
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
      .locator("svg[data-family]");
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
    await registerUser(page, "bot-model-none", "No Provider");
    await page.goto("/settings/bots");
    await expect(page.getByText("Your main bot")).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Add a provider to choose a model" }),
    ).toBeVisible();
  });

  test("the person sets how hard the bot's model thinks", async ({ page }) => {
    await registerUser(page, "bot-effort", "Effort Setter");
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

    await field.fill("10");
    await field.press("Enter");
    await expect(page.getByText(/Use a whole number of tokens from 1,000/)).toBeVisible();
    await expect(field).toHaveValue("50000");
    expect(await size()).toBe(50000);

    await field.fill("");
    await field.press("Enter");
    await expect.poll(size).toBeNull();
  });

  test("on a phone the chat fits the screen, composer included", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await registerUser(page, "bot-phone", "Phone Person");
    await page.goto("/bot");
    await expect(page.getByRole("textbox", { name: "Message" })).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(
      800,
    );
  });

  test("a message of several lines moves the input above the buttons, and back when it is sent", async ({
    page,
  }) => {
    await registerUser(page, "bot-multiline", "Multiline Person");
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
