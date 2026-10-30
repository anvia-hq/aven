import type { ChildProcess } from "node:child_process";

import { expect, test } from "@playwright/test";

import { registerUser, threadOnFakeRunner } from "./helpers";

// The composer's `@` and `/` (decision 0036): a file of the workspace and a skill, picked from a
// menu, become tokens, travel with the message to the runner and show as chips in the thread.
test.describe("mentions in the composer", () => {
  let runner: ChildProcess | undefined;
  test.afterEach(() => {
    runner?.kill();
    runner = undefined;
  });

  test("@ picks a file and / a skill, and the runner is told which", async ({ page }) => {
    await registerUser(page, "men", "Mention User");
    // The run needs a model grant; the pretend runner never calls the model.
    const provider = await page.request.post("/api/providers", {
      data: { kind: "anthropic", name: "Anthropic", apiKey: "sk-ant-test" },
    });
    expect(provider.ok()).toBe(true);
    const { child, events, threadId } = await threadOnFakeRunner(page);
    runner = child;

    await page.goto(`/threads/${threadId}`);
    const prompt = page.getByRole("textbox", { name: "Prompt" });
    const menu = page.getByRole("listbox", { name: "Mention" });

    await prompt.click();
    await page.keyboard.type("fix @greet");
    await expect(menu.getByRole("option", { name: "src/greeting.ts" })).toBeVisible();
    await page.keyboard.press("Enter");
    await page.keyboard.type("with /writ");
    await expect(menu.getByRole("option", { name: /writing-skills/ })).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(menu).toHaveCount(0);
    await expect(prompt.locator('[data-mention="file"]')).toHaveText("src/greeting.ts");
    await expect(prompt.locator('[data-mention="skill"]')).toHaveText("writing-skills");

    // Text after a `/` that names no skill still sends on Enter.
    await page.keyboard.type("/nothing");
    await expect(menu.getByText("No skill matches")).toBeVisible();
    await page.keyboard.press("Enter");

    await expect.poll(() => events.find((event) => event.type === "started")).toBeTruthy();
    const started = events.find((event) => event.type === "started");
    expect(started).toEqual({
      type: "started",
      prompt: "fix @src/greeting.ts with /writing-skills /nothing",
      mentions: [
        { type: "file", name: "src/greeting.ts", from: 4, to: 20 },
        { type: "skill", name: "writing-skills", from: 26, to: 41 },
      ],
    });

    const sent = page.locator('[data-role="user"]');
    await expect(sent.locator('[data-mention="file"]')).toHaveText("src/greeting.ts");
    await expect(sent.locator('[data-mention="skill"]')).toHaveText("writing-skills");
    await expect(prompt).toHaveText("");
  });
});
