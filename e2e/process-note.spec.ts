import type { ChildProcess } from "node:child_process";

import { expect, test } from "@playwright/test";

import { registerUser, threadOnFakeRunner } from "./helpers";

const NOTE =
  "[process] Process de55e912 (pnpm test) ended with exit code 0 after 322s.You started it in the background; carry on with what you meant to do when it finished.";

test.describe("a background process that ended", () => {
  let runner: ChildProcess | undefined;
  test.afterEach(() => {
    runner?.kill();
    runner = undefined;
  });

  test("shows nothing in the thread, though the agent is told", async ({ page }) => {
    await registerUser(page, "pnote", "Note User");
    const provider = await page.request.post("/api/providers", {
      data: { kind: "anthropic", name: "Anthropic", apiKey: "sk-ant-test" },
    });
    expect(provider.ok()).toBe(true);
    const { child, events, threadId } = await threadOnFakeRunner(page, { FAKE_RUN_ENDS: "1" });
    runner = child;

    await page.goto(`/threads/${threadId}`);
    const prompt = page.getByRole("textbox", { name: "Prompt" });
    await prompt.click();
    await page.keyboard.insertText(NOTE);
    await page.keyboard.press("Enter");

    await expect.poll(() => events.find((event) => event.type === "started")).toBeTruthy();
    await expect(page.getByText("Done.")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("ended with exit code 0")).toHaveCount(0);
    await expect(page.getByText("You started it in the background")).toHaveCount(0);
  });
});
