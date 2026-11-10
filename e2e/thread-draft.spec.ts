import type { ChildProcess } from "node:child_process";

import { expect, test } from "@playwright/test";

import { registerUser, threadOnFakeRunner } from "./helpers";

test.describe("a thread's message draft", () => {
  let runner: ChildProcess | undefined;
  test.afterEach(() => {
    runner?.kill();
    runner = undefined;
  });

  test("is kept per thread, across a reload and a switch between threads", async ({ page }) => {
    await registerUser(page, "drf", "Draft User");
    const { child, threadId } = await threadOnFakeRunner(page);
    runner = child;
    const provider = await page.request.post("/api/providers", {
      data: { kind: "anthropic", name: "Anthropic", apiKey: "sk-ant-test" },
    });
    expect(provider.ok()).toBe(true);
    const projects = (await (await page.request.get("/api/projects")).json()) as { id: string }[];
    const made = await page.request.post("/api/threads", { data: { projectId: projects[0]!.id } });
    const otherId = ((await made.json()) as { id: string }).id;
    const prompt = page.getByRole("textbox", { name: "Prompt" });

    await page.setViewportSize({ width: 1400, height: 800 });
    await page.goto(`/threads/${threadId}`);
    await prompt.fill("half a message");

    await page.reload();
    await expect(prompt).toHaveText("half a message");

    await page.locator(`a[href="/threads/${otherId}"]`).first().click();
    await expect(page).toHaveURL(new RegExp(`/threads/${otherId}`));
    await expect(prompt).toHaveText("");
    await prompt.fill("another thread");

    await page.locator(`a[href="/threads/${threadId}"]`).first().click();
    await expect(page).toHaveURL(new RegExp(`/threads/${threadId}`));
    await expect(prompt).toHaveText("half a message");
    await page.screenshot({ path: ".aven/proof/thread-draft/restored.png" });

    await prompt.press("Enter");
    await expect(prompt).toHaveText("");
    await page.reload();
    await expect(prompt).toHaveText("");
  });
});
