import type { ChildProcess } from "node:child_process";

import { expect, test } from "@playwright/test";

import { registerUser, threadOnFakeRunner } from "./helpers";

test.describe("subagents", () => {
  let runner: ChildProcess | undefined;
  test.afterEach(() => {
    runner?.kill();
    runner = undefined;
  });

  test("each shows as one line, and the one that failed says why", async ({ page }) => {
    await registerUser(page, "subs", "Sub Agents");
    const provider = await page.request.post("/api/providers", {
      data: { kind: "anthropic", name: "Anthropic", apiKey: "sk-ant-test" },
    });
    expect(provider.ok()).toBe(true);
    const { child, threadId } = await threadOnFakeRunner(page, { FAKE_SUBAGENTS: "1" });
    runner = child;

    await page.goto(`/threads/${threadId}`);
    await page.getByRole("textbox", { name: "Prompt" }).fill("find auth and test it");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByText("the test could not be written")).toBeVisible();
    const worked = page.locator('[data-role="worked"]');
    await expect(worked).toHaveAttribute("aria-expanded", "false");
    await worked.click();

    await expect(page.getByText("Find the auth middleware")).toBeVisible();
    await expect(page.getByText("Add a test")).toBeVisible();
    await expect(page.getByText("1 tool call")).toHaveCount(0);
    await expect(page.getByText("Read src/auth.ts")).toHaveCount(0);
    await expect(page.getByText("Auth lives in")).toHaveCount(0);
    await expect(page.getByText("The model refused.")).toBeVisible();
    await expect(page.getByLabel("Failed")).toBeVisible();
  });
});
