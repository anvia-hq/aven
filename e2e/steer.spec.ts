import type { ChildProcess } from "node:child_process";

import { expect, test, type Page } from "@playwright/test";

import { registerUser, threadOnFakeRunner } from "./helpers";

// A message sent while the agent works (decision 0098): it shows at once as queued, the agent takes
// it at its next step and it becomes the person's message, and the composer stays usable.
test.describe("steering a running agent", () => {
  let runner: ChildProcess | undefined;
  test.afterEach(() => {
    runner?.kill();
    runner = undefined;
  });

  async function runningThread(page: Page, env: Record<string, string> = {}) {
    await registerUser(page, "str", "Steer User");
    // The run needs a model grant; the pretend runner never calls the model.
    const provider = await page.request.post("/api/providers", {
      data: { kind: "anthropic", name: "Anthropic", apiKey: "sk-ant-test" },
    });
    expect(provider.ok()).toBe(true);
    // The run goes on until the spec is over: it is the agent that has not finished.
    const { child, events, threadId } = await threadOnFakeRunner(page, {
      FAKE_RUN_ENDS_AFTER: "120000",
      ...env,
    });
    runner = child;
    await page.goto(`/threads/${threadId}`);
    await page.request.post(`/api/threads/${threadId}/messages`, { data: { prompt: "build it" } });
    await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
    return { events, threadId };
  }

  test("a message sent while it works is shown at once as queued, then becomes the person's own", async ({
    page,
  }) => {
    const { events } = await runningThread(page, { FAKE_STEER_APPLIES_AFTER: "1500" });
    const prompt = page.getByRole("textbox", { name: "Prompt" });
    await prompt.click();
    await page.keyboard.type("use the other API");
    await page.getByRole("button", { name: "Send" }).click();

    // Before the agent has it: dimmed and said to be queued, and the composer is free again.
    const queued = page.locator("[data-queued]");
    await expect(queued).toContainText("use the other API");
    await expect(queued).toContainText("Queued");
    await expect(prompt).toHaveText("");
    await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
    await expect
      .poll(() =>
        events.some((event) => event.type === "steer" && event.prompt === "use the other API"),
      )
      .toBe(true);

    // The agent reads it: it is an ordinary message of the conversation now.
    await expect(queued).toHaveCount(0, { timeout: 8000 });
    const user = page.locator('[data-role="user"]:not([data-queued])');
    await expect(user).toHaveCount(2);
    await expect(user.last()).toContainText("use the other API");
  });

  test("shows the message before the server has answered, and takes it back if it is refused", async ({
    page,
  }) => {
    await runningThread(page, { FAKE_STEER_APPLIES_AFTER: "60000" });
    // The server answers late, and the second time with a refusal.
    let calls = 0;
    await page.route("**/api/threads/*/messages", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      calls++;
      await new Promise((resolve) => setTimeout(resolve, 1500));
      if (calls === 1) return route.continue();
      return route.fulfill({ status: 409, contentType: "text/plain", body: "No thanks" });
    });
    const prompt = page.getByRole("textbox", { name: "Prompt" });
    await prompt.click();
    await page.keyboard.type("first");
    await page.keyboard.press("Enter");
    // Within a fraction of the server's 1.5 seconds, the composer still holding what was typed.
    await expect(page.locator("[data-queued]")).toContainText("first", { timeout: 500 });
    await expect(prompt).toHaveText("first");
    await expect(prompt).toHaveText("", { timeout: 4000 });

    await page.keyboard.type("second");
    await page.keyboard.press("Enter");
    await expect(page.locator("[data-queued]")).toHaveCount(2, { timeout: 500 });
    // Refused: it is not shown as waiting any more, and what was typed is still there to send again.
    await expect(page.locator("[data-queued]")).toHaveCount(1, { timeout: 4000 });
    await expect(page.locator("[data-queued]")).toContainText("first");
    await expect(prompt).toHaveText("second");
    await expect(page.getByText("No thanks").first()).toBeVisible();
  });

  test("Enter sends it, and Stop is still there", async ({ page }) => {
    const { events } = await runningThread(page, { FAKE_STEER_APPLIES_AFTER: "60000" });
    const prompt = page.getByRole("textbox", { name: "Prompt" });
    await prompt.click();
    await page.keyboard.type("and add tests");
    // Send is beside Stop while there is something to send, and not without.
    await expect(page.getByRole("button", { name: "Send" })).toBeVisible();
    await page.keyboard.press("Enter");

    await expect(page.locator("[data-queued]")).toContainText("and add tests");
    await expect.poll(() => events.some((event) => event.type === "steer")).toBe(true);
    await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Send" })).toHaveCount(0);
  });

  test("a message the runner refuses goes away and says why", async ({ page }) => {
    await runningThread(page, { FAKE_STEER_REFUSES: "The agent is working on a goal" });
    await page.getByRole("textbox", { name: "Prompt" }).click();
    await page.keyboard.type("hello?");
    await page.keyboard.press("Enter");

    await expect(page.getByText("The agent is working on a goal").first()).toBeVisible();
    await expect(page.locator("[data-queued]")).toHaveCount(0);
  });

  test("what is waiting is still shown after the page is reloaded", async ({ page }) => {
    const { threadId } = await runningThread(page, { FAKE_STEER_APPLIES_AFTER: "60000" });
    await page.getByRole("textbox", { name: "Prompt" }).click();
    await page.keyboard.type("remember this");
    await page.keyboard.press("Enter");
    await expect(page.locator("[data-queued]")).toContainText("remember this");

    await page.goto(`/threads/${threadId}`);
    await expect(page.locator("[data-queued]")).toContainText("remember this");
  });

  test("files cannot go with it: attaching is off while the agent works", async ({ page }) => {
    await runningThread(page);
    await expect(page.getByRole("button", { name: "Attach files" })).toBeDisabled();
  });
});
