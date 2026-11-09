import type { ChildProcess } from "node:child_process";

import { expect, test } from "@playwright/test";

import {
  addRunner,
  connectGithub,
  importRepository,
  registerUser,
  threadOnFakeRunner,
} from "./helpers";

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
  test("leaves one Worked line for the answers it woke the agent for, with their times added", async ({
    page,
  }) => {
    const said = (text: string) => ({ type: "text", text });
    const ran = (id: string) => ({
      type: "tool",
      tool: { id, name: "exec_command", target: "bun test", status: "done" },
    });
    const events = [
      {
        type: "snapshot",
        running: false,
        messages: [
          { id: "m0", role: "user", parts: [said("Review the PRs")] },
          {
            id: "m1",
            role: "assistant",
            parts: [ran("c1"), said("Suite is running in the background.")],
            workedMs: 60_000,
          },
          { id: "m2", role: "user", parts: [said(NOTE)] },
          {
            id: "m3",
            role: "assistant",
            parts: [ran("c2"), said("CI is still running.")],
            workedMs: 30_000,
          },
          { id: "m4", role: "user", parts: [said(NOTE)] },
          {
            id: "m5",
            role: "assistant",
            parts: [ran("c3"), said("Everything passed.")],
            workedMs: 5_000,
          },
        ],
      },
    ];
    await page.route("**/api/threads/*/events", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: `retry: 600000\n\n${events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("")}`,
      }),
    );

    await registerUser(page, "pnote", "Note User");
    await addRunner(page);
    await connectGithub(page);
    await page.goto("/threads");
    await importRepository(page, "project");
    await page.getByRole("textbox", { name: "Prompt" }).fill("Review the PRs");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByText("Everything passed.")).toBeVisible();
    await expect(page.locator('[data-role="worked"]')).toHaveCount(1);
    await expect(page.locator('[data-role="worked"]')).toHaveText("Worked for 1m 35s");
  });
});
