import type { ChildProcess } from "node:child_process";

import { expect, test, type Page } from "@playwright/test";

import { registerUser, threadOnFakeRunner } from "./helpers";

const IN_TWO_HOURS = Date.now() + (2 * 60 + 10) * 60_000 + 30_000;
const IN_THREE_DAYS = Date.now() + (3 * 24 + 5) * 3_600_000 + 60_000;
const LIMITS = JSON.stringify([
  { window: "five_hour", status: "allowed", percent: 42, resetsAt: IN_TWO_HOURS },
  { window: "seven_day", status: "allowed_warning", percent: 78, resetsAt: IN_THREE_DAYS },
]);

async function runOnce(page: Page, threadId: string) {
  await page.setViewportSize({ width: 1400, height: 760 });
  await page.goto(`/threads/${threadId}`);
  const began = await page.request.post(`/api/threads/${threadId}/messages`, {
    data: { prompt: "build it" },
  });
  expect(began.ok(), await began.text()).toBe(true);
  await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
}

test.describe("the Limits card", () => {
  let runner: ChildProcess | undefined;
  test.afterEach(() => {
    runner?.kill();
    runner = undefined;
  });

  test("shows the subscription's 5-hour and weekly limits on a Claude thread", async ({ page }) => {
    await registerUser(page, "lim", "Limits User");
    const saved = await page.request.put("/api/claude-setup-token", {
      data: { token: "sk-ant-oat01-e2e-limits-card-9f3a" },
    });
    expect(saved.ok(), await saved.text()).toBe(true);
    const { child, threadId } = await threadOnFakeRunner(
      page,
      { FAKE_LIMITS: LIMITS, FAKE_RUN_ENDS_AFTER: "120000" },
      "claude",
    );
    runner = child;
    await runOnce(page, threadId);

    const limits = page.getByRole("region", { name: "Limits" });
    await expect(limits).toContainText("5-hour");
    await expect(limits).toContainText("42% used");
    await expect(limits).toContainText("resets in 2h 10m");
    await expect(limits).toContainText("Weekly");
    await expect(limits).toContainText("78% used");
    await expect(limits).toContainText("resets in 3d 5h");
    await expect(limits.getByText("78% used")).toHaveClass(/text-meter/);
    await expect(page.getByRole("button", { name: "Model and reasoning effort" })).toHaveAttribute(
      "title",
      /Claude subscription/,
    );

    const panel = page.getByRole("complementary", { name: "Overview" });
    await panel.screenshot({ path: ".aven/proof/limits/panel-dark.png" });
    await page
      .getByRole("button", { name: "Model and reasoning effort" })
      .screenshot({ path: ".aven/proof/limits/chip-dark.png" });
    await page.evaluate(() => document.documentElement.classList.remove("dark"));
    await panel.screenshot({ path: ".aven/proof/limits/panel-light.png" });
    await page
      .getByRole("button", { name: "Model and reasoning effort" })
      .screenshot({ path: ".aven/proof/limits/chip-light.png" });
  });

  test("is not shown on a thread that runs on an API model", async ({ page }) => {
    await registerUser(page, "limn", "No Limits User");
    const provider = await page.request.post("/api/providers", {
      data: { kind: "anthropic", name: "Anthropic", apiKey: "sk-ant-test" },
    });
    expect(provider.ok()).toBe(true);
    const { child, events, threadId } = await threadOnFakeRunner(page, {
      FAKE_LIMITS: LIMITS,
      FAKE_RUN_ENDS_AFTER: "120000",
    });
    runner = child;
    await runOnce(page, threadId);

    await expect(page.getByRole("region", { name: "Context" })).toBeVisible();
    await expect.poll(() => events.some((event) => event.type === "started")).toBe(true);
    await expect(page.getByRole("region", { name: "Limits" })).toHaveCount(0);
  });
});
