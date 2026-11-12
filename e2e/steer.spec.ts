import type { ChildProcess } from "node:child_process";

import { expect, test, type Page } from "@playwright/test";

import { registerUser, threadOnFakeRunner } from "./helpers";

test.describe("steering a running agent", () => {
  let runner: ChildProcess | undefined;
  test.afterEach(() => {
    runner?.kill();
    runner = undefined;
  });

  async function runningThread(page: Page, env: Record<string, string> = {}, attach = false) {
    await registerUser(page, "str", "Steer User");
    const provider = await page.request.post("/api/providers", {
      data: { kind: "anthropic", name: "Anthropic", apiKey: "sk-ant-test" },
    });
    expect(provider.ok()).toBe(true);
    const { child, events, threadId } = await threadOnFakeRunner(page, {
      FAKE_RUN_ENDS_AFTER: "120000",
      ...env,
    });
    runner = child;
    await page.goto(`/threads/${threadId}`);

    if (attach) {
      await page.locator('input[type="file"]').setInputFiles({
        name: "shot.png",
        mimeType: "image/png",
        buffer: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
          "base64",
        ),
      });
      await expect(page.getByRole("button", { name: "Remove shot.png" })).toBeVisible();
    }

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
    await page.keyboard.press("Enter");

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

    await expect(queued).toHaveCount(0, { timeout: 8000 });
    const user = page.locator('[data-role="user"]:not([data-queued])');
    await expect(user).toHaveCount(2);
    await expect(user.last()).toContainText("use the other API");
  });

  test("shows the message before the server has answered, and takes it back if it is refused", async ({
    page,
  }) => {
    await runningThread(page, { FAKE_STEER_APPLIES_AFTER: "60000" });
    let calls = 0;
    await page.route("**/api/threads/*/messages", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();

      const call = ++calls;
      await new Promise((resolve) => setTimeout(resolve, 1500));

      if (call === 1) return route.continue();

      return route.fulfill({ status: 409, contentType: "text/plain", body: "No thanks" });
    });
    const prompt = page.getByRole("textbox", { name: "Prompt" });
    await prompt.click();
    await page.keyboard.type("first");
    await page.keyboard.press("Enter");
    await expect(page.locator("[data-queued]")).toContainText("first", { timeout: 500 });
    await expect(prompt).toHaveText("", { timeout: 500 });

    await page.keyboard.type("second");
    await page.keyboard.press("Enter");
    await expect(page.locator("[data-queued]")).toHaveCount(2, { timeout: 500 });
    await expect(page.locator("[data-queued]")).toHaveCount(1, { timeout: 4000 });
    await expect(page.locator("[data-queued]")).toContainText("first");
    await expect(prompt).toHaveText("second");
    await expect(page.getByText("No thanks").first()).toBeVisible();
  });

  test("Enter sends it, and only Stop is shown while it works", async ({ page }) => {
    const { events } = await runningThread(page, { FAKE_STEER_APPLIES_AFTER: "60000" });
    const prompt = page.getByRole("textbox", { name: "Prompt" });
    await prompt.click();
    await page.keyboard.type("and add tests");
    await expect(page.getByRole("button", { name: "Send" })).toHaveCount(0);
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

  test("a file attached before the run stays in the draft while the words steer it", async ({
    page,
  }) => {
    const { events } = await runningThread(page, { FAKE_STEER_APPLIES_AFTER: "60000" }, true);
    const prompt = page.getByRole("textbox", { name: "Prompt" });
    await prompt.click();
    await page.keyboard.type("use the other API");
    await page.keyboard.press("Enter");

    await expect(page.locator("[data-queued]")).toContainText("use the other API");
    await expect
      .poll(() =>
        events.some((event) => event.type === "steer" && event.prompt === "use the other API"),
      )
      .toBe(true);
    await expect(page.getByRole("button", { name: "Remove shot.png" })).toBeVisible();
  });

  test("on the Claude agent a picture goes with the steering message, and is shown while it waits", async ({
    page,
  }) => {
    await registerUser(page, "strc", "Claude Steer");
    const saved = await page.request.put("/api/claude-setup-token", {
      data: { token: "sk-ant-oat01-e2e-steer-picture-9f3a" },
    });
    expect(saved.ok(), await saved.text()).toBe(true);
    const { child, threadId } = await threadOnFakeRunner(
      page,
      { FAKE_RUN_ENDS_AFTER: "120000", FAKE_STEER_APPLIES_AFTER: "60000" },
      "claude",
    );
    runner = child;
    await page.goto(`/threads/${threadId}`);
    const began = await page.request.post(`/api/threads/${threadId}/messages`, {
      data: { prompt: "build it" },
    });
    expect(began.ok(), await began.text()).toBe(true);
    await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Attach files" })).toBeEnabled();
    await page.locator('input[type="file"]').setInputFiles({
      name: "shot.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
        "base64",
      ),
    });
    const prompt = page.getByRole("textbox", { name: "Prompt" });
    await prompt.click();
    await page.keyboard.type("I mean this screen");
    await page.keyboard.press("Enter");

    const queued = page.locator("[data-queued]");
    await expect(queued).toContainText("I mean this screen");
    await expect(queued.getByRole("img")).toBeVisible();
    await expect(page.getByRole("button", { name: "Remove shot.png" })).toHaveCount(0);
  });

  test("files cannot go with it: attaching is off while the agent works", async ({ page }) => {
    await runningThread(page);
    await expect(page.getByRole("button", { name: "Attach files" })).toBeDisabled();
  });
});
