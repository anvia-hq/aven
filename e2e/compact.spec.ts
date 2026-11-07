import type { ChildProcess } from "node:child_process";

import { expect, test, type Page } from "@playwright/test";

import { registerUser, threadOnFakeRunner } from "./helpers";

test.describe("compacting a thread", () => {
  let runner: ChildProcess | undefined;
  test.afterEach(() => {
    runner?.kill();
    runner = undefined;
  });

  async function openThread(page: Page, usedTokens = 700_000) {
    await registerUser(page, "cmp", "Compact User");
    const provider = await page.request.post("/api/providers", {
      data: { kind: "anthropic", name: "Anthropic", apiKey: "sk-ant-test" },
    });
    expect(provider.ok()).toBe(true);
    const { child, events, threadId } = await threadOnFakeRunner(page, { FAKE_RUN_ENDS: "1" });
    runner = child;
    await page.route("**/api/threads/*/events", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: `retry: 600000\n\ndata: ${JSON.stringify({
          type: "snapshot",
          running: false,
          messages: [],
          usage: {
            totals: { inputTokens: 1, outputTokens: 1, cacheWriteTokens: 0, cacheReadTokens: 0 },
            context: { usedTokens, contextWindow: 1_000_000 },
          },
        })}\n\n`,
      }),
    );
    await page.setViewportSize({ width: 1400, height: 760 });
    await page.goto(`/threads/${threadId}`);
    return events;
  }

  test("the Context card's button sends the runner a run that only compacts", async ({ page }) => {
    const events = await openThread(page);
    const context = page.getByRole("region", { name: "Context" });
    await expect(context).toContainText("70% used");

    await context.getByRole("button", { name: "Compact" }).click();

    await expect.poll(() => events.find((event) => event.type === "started")).toBeTruthy();
    expect(events.find((event) => event.type === "started")).toMatchObject({
      prompt: "/compact",
      compact: true,
    });
  });

  test("the button waits until a quarter of the window is used", async ({ page }) => {
    await openThread(page, 240_000);
    const context = page.getByRole("region", { name: "Context" });
    await expect(context).toContainText("24% used");
    await expect(context.getByRole("button", { name: "Compact" })).toHaveCount(0);
  });

  test("the button shows at a quarter", async ({ page }) => {
    await openThread(page, 250_000);
    const context = page.getByRole("region", { name: "Context" });
    await expect(context).toContainText("25% used");
    await expect(context.getByRole("button", { name: "Compact" })).toBeVisible();
  });

  test("/compact in the composer does the same, and is not sent as a message", async ({ page }) => {
    const events = await openThread(page);
    const prompt = page.getByRole("textbox", { name: "Prompt" });
    const menu = page.getByRole("listbox", { name: "Mention" });

    await prompt.click();
    await page.keyboard.type("/comp");
    await expect(
      menu.getByRole("option").filter({ has: page.getByText("compact", { exact: true }) }),
    ).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(prompt.locator('[data-mention="command"]')).toHaveText("/compact");
    await page.keyboard.press("Enter");

    await expect.poll(() => events.find((event) => event.type === "started")).toBeTruthy();
    expect(events.find((event) => event.type === "started")).toMatchObject({
      prompt: "/compact",
      compact: true,
    });
    await expect(prompt).toHaveText("");
  });
});
