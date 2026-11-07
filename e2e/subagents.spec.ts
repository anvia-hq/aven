import type { ChildProcess } from "node:child_process";

import { expect, test } from "@playwright/test";

import { registerUser, threadOnFakeRunner } from "./helpers";

test.describe("subagents", () => {
  let runner: ChildProcess | undefined;
  test.afterEach(() => {
    runner?.kill();
    runner = undefined;
  });

  test("each shows as a card with its work and what it sent back", async ({ page }) => {
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

    const explorer = page.getByRole("button", { name: /Find the auth middleware/ });
    await expect(explorer).toBeVisible();
    await expect(explorer).toContainText("explore");
    await expect(explorer).toContainText("1 tool call");
    await expect(page.getByRole("button", { name: /Add a test/ })).toContainText("general");

    await explorer.click();
    await expect(page.getByRole("button", { name: /Read src\/auth\.ts/ })).toBeVisible();
    await expect(page.getByText("Auth lives in")).toBeVisible();

    await page.getByRole("button", { name: /Add a test/ }).click();
    await expect(page.getByText("The model refused.")).toBeVisible();
    await expect(page.getByLabel("Failed")).toBeVisible();

    await expect(page.getByText("the test could not be written")).toBeVisible();
  });
});
