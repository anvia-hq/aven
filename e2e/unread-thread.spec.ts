import type { ChildProcess } from "node:child_process";

import { expect, test } from "@playwright/test";

import { registerUser, threadOnFakeRunner } from "./helpers";

test.describe("a thread that finished while it was not open", () => {
  let runner: ChildProcess | undefined;
  test.afterEach(() => {
    runner?.kill();
    runner = undefined;
  });

  test("shows a dot in the sidebar until it is opened", async ({ page }) => {
    await registerUser(page, "unr", "Unread User");
    const provider = await page.request.post("/api/providers", {
      data: { kind: "anthropic", name: "Anthropic", apiKey: "sk-ant-test" },
    });
    expect(provider.ok()).toBe(true);
    const { child, threadId } = await threadOnFakeRunner(page, { FAKE_RUN_ENDS_AFTER: "3000" });
    runner = child;
    await page.goto(`/threads/${threadId}`);
    await page.request.post(`/api/threads/${threadId}/messages`, { data: { prompt: "build it" } });
    await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();

    await page.goto("/threads");
    const dot = page.getByRole("img", { name: "Finished, not opened yet" });
    await expect(dot).toBeVisible({ timeout: 15000 });

    await page.reload();
    await expect(dot).toBeVisible();

    await page.locator(`a[href="/threads/${threadId}"]`).first().click();
    await expect(dot).toHaveCount(0);
  });

  test("a thread that finishes while it is open gets no dot", async ({ page }) => {
    await registerUser(page, "unr", "Unread User");
    await page.request.post("/api/providers", {
      data: { kind: "anthropic", name: "Anthropic", apiKey: "sk-ant-test" },
    });
    const { child, threadId } = await threadOnFakeRunner(page, { FAKE_RUN_ENDS_AFTER: "2000" });
    runner = child;
    await page.goto(`/threads/${threadId}`);
    await page.request.post(`/api/threads/${threadId}/messages`, { data: { prompt: "build it" } });
    await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Send" })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("img", { name: "Finished, not opened yet" })).toHaveCount(0);
  });
});
