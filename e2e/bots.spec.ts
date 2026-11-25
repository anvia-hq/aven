import { expect, test, type Page } from "@playwright/test";

import type { ChildProcess } from "node:child_process";

import { registerBotPerson, threadOnFakeRunner } from "./helpers";

const bubble = (page: Page, text: string) =>
  page
    .locator('[data-slot="bubble-content"], [data-role="user"]')
    .filter({ hasText: new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) });

test.describe("bots", () => {
  test("bubbles in a row of one speaker lose the rounding of their left side where they touch", async ({
    page,
  }) => {
    await registerBotPerson(page, "corners", "Corners User");
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
    await registerBotPerson(page, "bot", "Bot Person");
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
    await expect(page.getByText("You were just created")).toHaveCount(0);
    await expect(page.getByRole("status", { name: /typing/ })).toBeHidden();

    const phrase = "hello bot";
    const held = await page.request.post("http://localhost:8102/e2e/hold", {
      data: { phrase },
    });
    expect(held.ok()).toBe(true);

    const tile = page.locator('a[aria-label="Aven, main bot"] canvas[data-mood]');
    const typing = page.locator('[role="status"] canvas[data-mood]');

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

    await page.reload();
    await expect(bubble(page, "hello bot")).toBeVisible();
    await expect(bubble(page, "Hey there!")).toBeVisible();
    await expect(bubble(page, "You said: hello bot")).toBeVisible();
  });

  test("a bot sends a file with its message, the chat shows a card, and opening it fills a side panel that survives a reload, with a version for each time it is sent again", async ({
    page,
  }) => {
    await registerBotPerson(page, "bot-file", "File Person");
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

  test("a page a bot sends fills the side panel", async ({ page }) => {
    await registerBotPerson(page, "bot-page", "Page Person");
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
    await box.fill("send the page");
    await box.press("Enter");

    const card = page.locator('[data-role="artifact-card"]');
    await expect(card).toHaveCount(1);
    await card.click();
    const panel = page.locator('[data-role="artifact-panel"]');
    await expect(panel).toBeVisible();

    const frame = panel.locator("iframe");
    await expect(frame).toHaveAttribute("sandbox", "allow-scripts");
    await expect(panel.frameLocator("iframe").locator("#cheat")).toHaveText(
      "Types and their values",
    );
    await expect
      .poll(async () => {
        const frameBox = await frame.boundingBox();
        const panelBox = await panel.boundingBox();
        const gap = (panelBox?.height ?? 0) - (frameBox?.height ?? 0);
        return gap > 20 && gap < 60;
      })
      .toBe(true);
  });

  test("a bot quotes the message it answers and reacts to it, and the person quotes one too", async ({
    page,
  }) => {
    await registerBotPerson(page, "bot-quote", "Quote Person");
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
    await registerBotPerson(page, "bot-skills", "Skills Person");
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
    await registerBotPerson(page, "bot-mcp", "Mcp Person");
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
    await registerBotPerson(page, "bot-provider", "Provider Person");
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
    const row = page.getByRole("listitem", { name: "Work Azure" });
    await expect(row).toContainText("gpt-5");
    await expect(row).toContainText("Configured");
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
      await registerBotPerson(page, "bot-thread", "Thread Person");
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
});
