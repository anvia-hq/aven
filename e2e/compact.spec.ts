import type { ChildProcess } from "node:child_process";

import { expect, test, type Page } from "@playwright/test";

import { registerUser, threadOnFakeRunner } from "./helpers";

// Compacting a thread (decision 0097): the Context card has a button and the composer's `/` a
// command, and either one has the runner summarize the conversation as a run that is only that.
test.describe("compacting a thread", () => {
  let runner: ChildProcess | undefined;
  test.afterEach(() => {
    runner?.kill();
    runner = undefined;
  });

  async function openThread(page: Page) {
    await registerUser(page, "cmp", "Compact User");
    const provider = await page.request.post("/api/providers", {
      data: { kind: "anthropic", name: "Anthropic", apiKey: "sk-ant-test" },
    });
    expect(provider.ok()).toBe(true);
    const { child, events, threadId } = await threadOnFakeRunner(page, { FAKE_RUN_ENDS: "1" });
    runner = child;
    // The context is known once the agent has replied; a stand-in snapshot says it is.
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
            context: { usedTokens: 700_000, contextWindow: 1_000_000 },
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
