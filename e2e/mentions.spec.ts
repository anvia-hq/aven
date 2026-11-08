import type { ChildProcess } from "node:child_process";

import { expect, test } from "@playwright/test";

import { registerUser, threadOnFakeRunner } from "./helpers";

test.describe("mentions in the composer", () => {
  let runner: ChildProcess | undefined;
  test.afterEach(() => {
    runner?.kill();
    runner = undefined;
  });

  test("@ picks a file and / a skill, and the runner is told which", async ({ page }) => {
    await registerUser(page, "men", "Mention User");
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
    await expect(sent.locator('[data-mention="skill"] svg')).toHaveCount(0);
    await expect(sent.locator('[data-mention="file"] svg')).toHaveCount(1);
    await expect(prompt).toHaveText("");
  });

  test("/ offers the built-in setup skills", async ({ page }) => {
    await registerUser(page, "men", "Mention User");
    const { child, threadId } = await threadOnFakeRunner(page);
    runner = child;
    await page.goto(`/threads/${threadId}`);

    await page.getByRole("textbox", { name: "Prompt" }).click();
    await page.keyboard.type("/setup");

    const menu = page.getByRole("listbox", { name: "Mention" });
    for (const skill of ["setup-env", "setup-ship", "setup-actions"]) {
      await expect(
        menu.getByRole("option").filter({ has: page.getByText(skill, { exact: true }) }),
      ).toBeVisible();
    }
  });
});
