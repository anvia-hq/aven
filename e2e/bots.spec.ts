import { expect, test, type Page } from "@playwright/test";

import { registerUser } from "./helpers";

// A 1 x 1 PNG, the smallest picture a message can show.
const PIXEL =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==";

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

    // The bot types, then each message shows after its own pause. While it works its eyes are open,
    // in the sidebar and by the line that says so, and shut again when it is done.
    const tile = page.locator('a[aria-label="Aven, main bot"] svg[data-mood]');
    await expect(page.getByRole("status", { name: /typing/ })).toBeVisible();
    await expect(tile).toHaveAttribute("data-mood", "working");
    await expect(page.getByRole("status", { name: /typing/ }).locator("svg")).toHaveAttribute(
      "data-mood",
      "working",
    );
    await expect(bubble(page, "Hey there!")).toBeVisible();
    await expect(bubble(page, "You said: hello bot")).toBeVisible();
    await expect(page.getByRole("status", { name: /typing/ })).toBeHidden();
    await expect(tile).toHaveAttribute("data-mood", "idle");

    // The bot has a shell of its own: its main bot is the tile of its sidebar, in place of the
    // threads and projects.
    await expect(page.getByRole("link", { name: "Projects" })).toBeHidden();

    // The chat is the server's: it is all there after a reload.
    await page.reload();
    await expect(bubble(page, "hello bot")).toBeVisible();
    await expect(bubble(page, "Hey there!")).toBeVisible();
    await expect(bubble(page, "You said: hello bot")).toBeVisible();
  });

  // A bot has the person's skills as a thread's agent has (decision 0081): the built-in ones reach
  // it through the runner, and its instructions list them.
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
    // The first built-in skill by name, which only the runner's copy of the person's skills lists.
    await expect(bubble(page, "I have the aven-help skill")).toBeVisible();
  });

  // A bot keeps the person's MCP servers on their word (decision 0085): what it adds is on their
  // Settings page, with the header's name and never its value.
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

  // A bot keeps the person's providers on their word, and never touches a key (decision 0086): it
  // adds the provider, and the person types the key into a masked card that saves it to the provider.
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

    // It has no key yet, and is not the default: the person's own provider still is.
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

    // The key is saved to the provider, and in nothing the person or the bot said.
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

    // Settings shows it, with the end of its key and nothing more.
    await page.goto("/settings/providers");
    await expect(page.getByRole("region", { name: "Azure OpenAI" })).toContainText(
      "https://work.openai.azure.com · gpt-5 · …1234",
    );
  });

  // Files go to a bot as they go to a thread's agent (decision 0080): a file lands in the bot's
  // /uploads and it is told where, an image is shown to the model too, and all of it is in the chat
  // after a reload.
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
    // Picked, not sent: the chip and the preview have a remove button each.
    await expect(page.getByRole("button", { name: "Remove notes.txt" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Remove pixel.png" })).toBeVisible();

    await page.getByRole("textbox", { name: "Message" }).fill("look at these");
    await page.getByRole("textbox", { name: "Message" }).press("Enter");

    // Sent: the composer is clear, and the message shows its files above the words.
    await expect(bubble(page, "look at these")).toBeVisible();
    await expect(page.getByRole("button", { name: "Remove notes.txt" })).toBeHidden();
    await expect(page.getByText("notes.txt", { exact: true })).toBeVisible();
    const image = page.getByRole("img", { name: "pixel.png" });
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1);

    // The bot heard the words and was told where the runner put each file.
    const heard = page.locator('[data-slot="bubble-content"]').filter({ hasText: "You said:" });
    await expect(heard).toContainText("look at these");
    await expect(heard).toContainText("/uploads/notes.txt");
    await expect(heard).toContainText("/uploads/pixel.png");
    await expect(heard).toContainText("shown to you below");

    // The chat is the server's: the files are in it after a reload, the image still loads, and the
    // note the bot was given about them is not part of what the person said.
    await page.reload();
    await expect(bubble(page, "look at these")).toBeVisible();
    await expect(page.getByText("notes.txt", { exact: true })).toBeVisible();
    const again = page.getByRole("img", { name: "pixel.png" });
    await expect(again).toBeVisible();
    await expect.poll(() => again.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1);
    await expect(page.getByText("The user attached 2 files")).toHaveCount(1);
  });

  // A message may be only files.
  test("files alone make a message", async ({ page }) => {
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
    await expect(page.getByText("plan.md", { exact: true })).toBeVisible();
    await expect(
      page.locator('[data-slot="bubble-content"]').filter({ hasText: "/uploads/plan.md" }),
    ).toBeVisible();
  });

  // The main bot makes a bot when asked (decision 0060): it shows in the sidebar, has a chat of
  // its own, and a person's other bots do not make bots.
  test("the main bot makes a new bot when asked, and it has a chat of its own", async ({
    page,
  }) => {
    // Two replies, each waiting out its typing pauses.
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

    // It is in the sidebar once the reply is over, under the main bot, and opens on its own page.
    const scout = page.getByRole("link", { name: /Scout/ });
    await expect(scout).toBeVisible();
    await expect(scout).toContainText("Researches what you ask.");
    await scout.click();
    await expect(page).toHaveURL(/\/bot\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { name: "Scout" })).toBeVisible();
    // It said hello unasked when it was made, and the note that woke it is not shown.
    await expect(bubble(page, "Hello, I am your new bot")).toBeVisible();
    await expect(page.getByText("You were just created")).toHaveCount(0);

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

  // The person mentions a bot with `@`, and the main bot writes to it and tells what it said
  // (decision 0063): the exchange is in the other bot's own chat.
  test("the person mentions a bot and the main bot asks it and tells what it said", async ({
    page,
  }) => {
    // Two replies on the main bot, one on the other, each waiting out its typing pauses.
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

    // Scout's own hello comes first, so the eyes seen open below are for what Aven asks of it.
    await page.getByRole("link", { name: /Scout/ }).click();
    await expect(bubble(page, "Hello, I am your new bot")).toBeVisible();
    await expect(page.getByRole("status", { name: /typing/ })).toBeHidden();
    await page.getByRole("link", { name: "Aven, main bot" }).click();
    await expect(bubble(page, "Scout is ready")).toBeVisible();

    // `@` offers the person's other bots, and not the one written to.
    await message.click();
    await page.keyboard.type("Ask @Sco");
    const menu = page.getByRole("listbox", { name: "Mention" });
    await expect(menu.getByRole("option", { name: /Scout/ })).toBeVisible();
    await expect(menu.getByRole("option", { name: /Aven/ })).toHaveCount(0);
    await page.keyboard.press("Enter");
    await expect(message.locator('[data-mention="bot"]')).toHaveText("Scout");
    await page.keyboard.type(" to do A, B and C");
    await page.keyboard.press("Enter");

    // What was sent shows the bot as a chip, and the main bot says it asked.
    const sent = page
      .locator('[data-slot="bubble-content"]')
      .filter({ hasText: "to do A, B and C" });
    await expect(sent.locator('[data-mention="bot"]')).toHaveText("Scout");
    await expect(bubble(page, "I asked Scout")).toBeVisible();
    await expect(message).toHaveText("");
    // Scout is woken by the message and at work on its answer: its eyes are open in the sidebar,
    // whichever chat is open, and shut when it has written back.
    await expect(page.locator('a[href^="/bot/"] svg[data-mood]')).toHaveAttribute(
      "data-mood",
      "working",
    );

    // The main bot hears from Scout later, in a message of its own, and tells the person.
    await expect(bubble(page, "Scout answered")).toBeVisible();
    await expect(page.locator('a[href^="/bot/"] svg[data-mood="idle"]')).toBeVisible();

    // Between the bots it is one line that opens, as in the harness: here, what was written and
    // what Scout wrote back, and no bubbles for them.
    const activity = page.locator('[data-activity="bots"]');
    await expect(activity).toContainText("2 messages with");
    await expect(activity).toContainText("Scout");
    await expect(bubble(page, "A, B and C")).toHaveCount(0);
    await activity.getByRole("button").click();
    await expect(activity).toContainText("Aven → Scout A, B and C");
    await expect(activity).toContainText("Scout → Aven You said: [from main] A, B and C");

    // The other bot's own chat has the same exchange, from its side, after the hello it made.
    await page.getByRole("link", { name: /Scout/ }).click();
    await expect(bubble(page, "Hello, I am your new bot")).toBeVisible();
    await expect(activity).toContainText("2 messages with");
    await expect(activity).toContainText("Aven");
    await activity.getByRole("button").click();
    await expect(activity).toContainText("Aven → Scout A, B and C");
    await expect(activity).toContainText("Scout → Aven You said: [from main] A, B and C");

    // Only the main bot writes to the others, so `@` offers nothing in this chat.
    await page.getByRole("textbox", { name: "Message" }).click();
    await page.keyboard.type("@Av");
    await expect(page.getByRole("textbox", { name: "Message" })).toContainText("@Av");
    // Absence cannot be waited for, so the menu gets the time it takes to open elsewhere.
    await page.waitForTimeout(300);
    await expect(page.getByRole("listbox", { name: "Mention" })).toHaveCount(0);
    await page.keyboard.press("Control+A");
    await page.keyboard.press("Backspace");

    // It is the chat's, so it is there after a reload, read back from what the bot remembers.
    await page.reload();
    await expect(bubble(page, "Hello, I am your new bot")).toBeVisible();
    await expect(activity).toContainText("2 messages with");
    await activity.getByRole("button").click();
    await expect(activity).toContainText("Aven → Scout A, B and C");
  });

  // A bot asks the person to decide with a card, and their answer is their next message (decision 0066).
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

    // The question is a card, not a bubble, with its choices.
    const card = page.getByRole("form", { name: "Answer Aven" });
    await expect(card.getByText("Which should I start with?").first()).toBeVisible();
    await card.getByRole("radio", { name: "Analyst" }).check();
    await card.getByRole("button", { name: "Send answer" }).click();

    // The answer is the person's next message; the card is spent and is a bubble now.
    await expect(bubble(page, "Analyst").first()).toBeVisible();
    await expect(bubble(page, "You said: Analyst")).toBeVisible();
    await expect(card).toHaveCount(0);

    // It is there after a reload, read back from what the bot remembers, and still not a card.
    await page.reload();
    await expect(bubble(page, "Which should I start with?")).toBeVisible();
    await expect(page.getByRole("form", { name: "Answer Aven" })).toHaveCount(0);
  });

  // A bot sets a task to run on a schedule when asked, in the person's timezone (decision 0067).
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

    // Their browser's timezone was the default, so "7 in the morning" is theirs.
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

    // The person can pause it, and then it has no next time.
    const paused = await page.request.patch(`/api/schedules/${schedules[0].id}`, {
      data: { enabled: false },
    });
    expect(paused.ok()).toBe(true);
    expect((await paused.json()).nextRun).toBeNull();

    // And choose another timezone in settings.
    await page.goto("/settings/profile");
    await page.getByRole("combobox", { name: "Timezone" }).click();
    await page.getByRole("option", { name: "Asia/Jakarta" }).click();
    await expect(page.getByText("Timezone saved")).toBeVisible();
    expect((await (await page.request.get("/api/preferences")).json()).timezone).toBe(
      "Asia/Jakarta",
    );
  });

  // A bot works on a goal in rounds nobody asks for (decision 0068): the person says it once.
  test("a bot starts a goal when asked and works it on its own until it is done", async ({
    page,
  }) => {
    // The reply that starts it, then a round, each waiting out its typing pauses.
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
    // Nobody wrote again: the app woke the bot for its round, and it finished.
    await expect(bubble(page, "Goal finished: the report is written")).toBeVisible();
    // The round's note is the app's, not part of the chat.
    await expect(page.getByText("Goal round")).toHaveCount(0);
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
    await expect(page.getByRole("textbox", { name: "Message" }).locator("p")).toHaveAttribute(
      "data-placeholder",
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
    // Something other than what the id drew, so every change below is one that can be seen.
    const shape = family === "hexagon" ? "square" : "hexagon";
    const paint = color?.toLowerCase() === "#ff6a00" ? "#00b2ff" : "#ff6a00";

    // The same bot looks the same on the next visit, without anything having been saved.
    await page.reload();
    await expect(look).toHaveAttribute("data-family", family!);
    await expect(look).toHaveAttribute("data-color", color!);

    await page.getByRole("button", { name: "Bot settings" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Change avatar" }).click();
    await page.getByRole("group", { name: "Shape" }).getByRole("button", { name: shape }).click();
    await page.getByRole("button", { name: `Color ${paint}` }).click();
    // The avatar in the dialog changes before anything is saved.
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

    // It is kept, and the picker opens on it.
    await page.reload();
    await expect(look).toHaveAttribute("data-family", shape);
    await page.getByRole("button", { name: "Bot settings" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Change avatar" }).click();
    await expect(
      page.getByRole("group", { name: "Shape" }).getByRole("button", { name: shape }),
    ).toHaveAttribute("aria-pressed", "true");

    // Generate offers characters to choose from. Escape closes the picker first and the dialog
    // next, and nothing was saved: after a reload the bot is as it was.
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
