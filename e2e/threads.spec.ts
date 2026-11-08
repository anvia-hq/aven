import type { ChildProcess } from "node:child_process";

import { expect, test, type Page } from "@playwright/test";

import {
  addRunner,
  connectGithub,
  importRepository,
  registerUser,
  threadOnFakeRunner,
} from "./helpers";

async function createProject(page: Page, name: string) {
  await connectGithub(page);
  await page.goto("/threads");
  await importRepository(page, name);
}

async function startThread(page: Page, prompt: string) {
  await addRunner(page);
  await createProject(page, "project");
  await page.getByRole("textbox", { name: "Prompt" }).fill(prompt);
  await page.getByRole("button", { name: "Send" }).click();
}

test.describe("threads", () => {
  test("the new thread page asks to import a repository first", async ({ page }) => {
    await registerUser(page, "thr", "Thread User");

    await expect(page.getByRole("heading", { name: "What should we build?" })).toBeVisible();
    await expect(page.getByText("Import a repository to get started.")).toBeVisible();
    await expect(page.getByRole("region", { name: "Recent threads" })).toContainText(
      "No threads yet.",
    );
  });

  test("a project needs a runner, and the dialog says where to add one", async ({ page }) => {
    await registerUser(page, "thr", "Thread User");
    await connectGithub(page);
    await page.goto("/threads");
    await page.getByRole("button", { name: "Import repository" }).click();
    await expect(page.getByText("A project needs a runner")).toBeVisible();
    await expect(page.getByRole("link", { name: "Add a runner" })).toBeVisible();
  });

  test("a thread started from a project opens with its prompt as the title", async ({ page }) => {
    await registerUser(page, "thr", "Thread User");
    await addRunner(page);
    await createProject(page, "project");
    await page.getByRole("textbox", { name: "Prompt" }).fill("hello");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page).toHaveURL(/\/threads\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { name: "hello" })).toBeVisible();
  });

  test("hovering a thread in the sidebar offers to archive it", async ({ page }) => {
    await registerUser(page, "thr", "Thread User");
    await addRunner(page);
    await createProject(page, "project");
    await page.getByRole("textbox", { name: "Prompt" }).fill("archive me");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page).toHaveURL(/\/threads\/[0-9a-f-]{36}$/);

    const item = page.locator("[data-slot=sidebar-menu-item]", { hasText: "archive me" });
    const archive = item.getByRole("button", { name: "Archive archive me" });
    const time = item.locator("time");
    await page.mouse.move(800, 400);
    await expect(time).toHaveText("now");
    await expect(archive).toHaveCSS("opacity", "0");
    await item.getByRole("link").click();
    await page.mouse.move(800, 400);
    await expect(archive).toHaveCSS("opacity", "0");
    await expect(time).toHaveCSS("opacity", "1");
    await item.hover();
    await expect(archive).toHaveCSS("opacity", "1");
    await expect(time).toHaveCSS("opacity", "0");
    await archive.click();

    await expect(page).toHaveURL(/\/threads$/);
    await expect(page.getByText("Thread archived")).toBeVisible();
    await expect(item).toHaveCount(0);
  });

  test("sending to an archived thread puts it back in the sidebar", async ({ page }) => {
    await registerUser(page, "thr", "Thread User");
    const provider = await page.request.post("/api/providers", {
      data: { kind: "anthropic", name: "Anthropic", apiKey: "sk-ant-test" },
    });
    expect(provider.ok()).toBe(true);
    const { child, threadId } = await threadOnFakeRunner(page, { FAKE_RUN_ENDS: "1" });
    try {
      const item = page.locator("[data-slot=sidebar-menu-item]", { hasText: "shiny-app" });
      await page.goto(`/threads/${threadId}`);
      await expect(item).toHaveCount(1);
      const archived = await page.request.patch(`/api/threads/${threadId}`, {
        data: { state: "archived" },
      });
      expect(archived.ok()).toBe(true);
      await page.goto(`/threads/${threadId}`);
      await expect(page.getByRole("textbox", { name: "Prompt" })).toBeVisible();
      await expect(item).toHaveCount(0);

      await page.getByRole("textbox", { name: "Prompt" }).fill("one more thing");
      await page.getByRole("button", { name: "Send" }).click();
      await expect(item).toHaveCount(1);
    } finally {
      child.kill();
    }
  });

  test("a prompt without choosing a project is refused and kept", async ({ page }) => {
    await registerUser(page, "thr", "Thread User");
    await addRunner(page);
    await createProject(page, "project");
    await page.getByRole("textbox", { name: "Prompt" }).fill("hello");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByRole("heading", { name: "hello" })).toBeVisible();

    await page.getByRole("button", { name: "New thread" }).click();
    await expect(page.getByRole("combobox", { name: "Project" })).toBeVisible();
    await page.getByRole("textbox", { name: "Prompt" }).fill("hello again");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByText("Choose a project first")).toBeVisible();
    await expect(page).toHaveURL(/\/threads$/);
    await expect(page.getByRole("textbox", { name: "Prompt" })).toHaveText("hello again");
  });

  test("creating a project opens the thread once prompted; with its runner offline the agent reports why", async ({
    page,
  }) => {
    await registerUser(page, "thr", "Thread User");
    await startThread(page, "Explain the project layout");

    await expect(page).toHaveURL(/\/threads\/[0-9a-f-]{36}$/);
    await expect(page.getByText("The runtime for this project is offline")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Explain the project layout" })).toBeVisible();
    await expect(
      page.locator('[data-slot="sidebar"]').getByText("Explain the project layout"),
    ).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Prompt" })).toBeEnabled();

    await page.getByRole("button", { name: "New thread" }).click();
    await page.getByRole("combobox", { name: "Project" }).click();
    await expect(page.getByRole("option", { name: "project" })).toBeVisible();
  });

  test("a first prompt is shown in the thread at once, before the server has it (decision 0126)", async ({
    page,
  }) => {
    await registerUser(page, "thr", "Thread User");
    await addRunner(page);
    await createProject(page, "project");
    await page.route("**/api/threads/*/messages", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      await new Promise((resolve) => setTimeout(resolve, 2000));
      return route.continue();
    });

    await page.getByRole("textbox", { name: "Prompt" }).fill("Explain the project layout");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page).toHaveURL(/\/threads\/[0-9a-f-]{36}$/, { timeout: 1500 });
    await expect(page.locator('[data-role="user"]')).toContainText("Explain the project layout", {
      timeout: 1500,
    });
    await expect(page.locator('[data-role="user"]')).toHaveCount(1);
  });

  test("a click anywhere in the prompt box puts the cursor in it", async ({ page }) => {
    await registerUser(page, "thr", "Thread User");
    await addRunner(page);
    await createProject(page, "project");
    const prompt = page.getByRole("textbox", { name: "Prompt" });
    const box = page.locator("div.bg-card", { has: prompt });
    const area = await prompt.boundingBox();
    const outer = await box.boundingBox();
    expect(area && outer).toBeTruthy();

    await page.mouse.click(area!.x + area!.width / 2, area!.y + area!.height - 6);
    await expect(prompt).toBeFocused();
    await page.keyboard.type("hello");
    await expect(prompt).toContainText("hello");

    await prompt.blur();
    await page.mouse.click(outer!.x + 3, outer!.y + 3);
    await expect(prompt).toBeFocused();
  });

  test("a thread from another organization is not found", async ({ page }) => {
    await registerUser(page, "thr", "Thread User");
    await page.goto("/threads/00000000-0000-4000-8000-000000000000");
    await expect(page.getByRole("heading", { name: "Thread not found" })).toBeVisible();
  });

  test("a fetch from GitHub reads as one, with what it did", async ({ page }) => {
    const events = [
      { type: "snapshot", running: true, messages: [] },
      { type: "run_start", prompt: "Catch up with main" },
      {
        type: "tool_start",
        tool: { id: "f1", name: "git_fetch", target: "default branch", status: "running" },
      },
      {
        type: "tool_end",
        id: "f1",
        status: "done",
        output: "origin/main is now at bbbbbbb (was aaaaaaa).",
      },
      { type: "text", delta: "Up to date." },
      { type: "done" },
    ];
    await page.route("**/api/threads/*/events", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: `retry: 600000\n\n${events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("")}`,
      }),
    );

    await registerUser(page, "thr", "Thread User");
    await startThread(page, "Catch up with main");

    const group = page.getByRole("button", { name: "Fetched from GitHub" });
    await expect(group).toBeVisible();
    await group.click();
    const call = page.getByRole("button", { name: /Fetched.*default branch/ });
    await expect(call).toBeVisible();
    await call.click();
    await expect(page.getByText("origin/main is now at bbbbbbb (was aaaaaaa).")).toBeVisible();
  });

  test("saving the environment reads as one step, with what it did", async ({ page }) => {
    const events = [
      { type: "snapshot", running: true, messages: [] },
      { type: "run_start", prompt: "Set up this repo" },
      {
        type: "tool_start",
        tool: { id: "e1", name: "save_environment", target: "", status: "running" },
      },
      {
        type: "tool_end",
        id: "e1",
        status: "done",
        output: "The environment is saved. New threads start from it.",
      },
      { type: "text", delta: "Done." },
      { type: "done" },
    ];
    await page.route("**/api/threads/*/events", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: `retry: 600000\n\n${events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("")}`,
      }),
    );

    await registerUser(page, "thr", "Thread User");
    await startThread(page, "Set up this repo");

    const group = page.getByRole("button", { name: "Saved the environment" });
    await expect(group).toBeVisible();
    await group.click();
    await page
      .getByRole("button", { name: /Saved the environment/ })
      .last()
      .click();
    await expect(
      page.getByText("The environment is saved. New threads start from it."),
    ).toBeVisible();
  });

  test("files the agent showed in one call are a grid, its images open in a viewer and a video that cannot load says so (decision 0136)", async ({
    page,
  }) => {
    const names = [1, 2, 3].map((n) => `00000000-0000-4000-8000-00000000000${n}.png`);
    const video = "00000000-0000-4000-8000-000000000004.mp4";
    const artifacts = [
      ...names.map((name, index) => ({
        name,
        mediaType: "image/png",
        caption: `Page ${index + 1}`,
      })),
      { name: video, mediaType: "video/mp4", caption: "The flow" },
    ];
    const events = [
      {
        type: "snapshot",
        running: false,
        messages: [
          { id: "m-0", role: "user", parts: [{ type: "text", text: "Show your work" }] },
          {
            id: "m-1",
            role: "assistant",
            parts: [
              { type: "text", text: "Here is the proof." },
              {
                type: "tool",
                tool: {
                  id: "c1",
                  name: "show_artifact",
                  target: "a.png, b.png, c.png, flow.mp4",
                  status: "done",
                  output: "Showed 4",
                  artifacts,
                },
              },
            ],
          },
        ],
      },
      { type: "done" },
    ];
    await page.route("**/api/threads/*/events", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: `retry: 600000\n\n${events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("")}`,
      }),
    );
    const PIXEL = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );
    await page.route("**/api/threads/*/artifacts/*", (route) =>
      route.request().url().endsWith(".mp4")
        ? route.fulfill({ status: 404, body: "" })
        : route.fulfill({ status: 200, contentType: "image/png", body: PIXEL }),
    );

    await registerUser(page, "art", "Artifact User");
    await startThread(page, "Show your work");
    await expect(page).toHaveURL(/\/threads\/[0-9a-f-]{36}$/);

    await expect(page.getByRole("button", { name: /^Open Page \d$/ })).toHaveCount(3);
    await expect(page.getByText("Video unavailable.")).toBeVisible();
    await expect(page.getByText("The flow")).toBeVisible();

    await page.getByRole("button", { name: "Open Page 1" }).click();
    const viewer = page.getByRole("dialog");
    await expect(viewer.getByText("1 of 3")).toBeVisible();
    await page.keyboard.press("ArrowRight");
    await expect(viewer.getByText("2 of 3")).toBeVisible();
    await viewer.getByRole("button", { name: "Previous" }).click();
    await viewer.getByRole("button", { name: "Previous" }).click();
    await expect(viewer.getByText("3 of 3")).toBeVisible();
  });

  test("the thread view renders a streamed run: tool calls, a diff, an error and the reply", async ({
    page,
  }) => {
    const events = [
      {
        type: "snapshot",
        running: true,
        messages: [
          { id: "m-0", role: "user", parts: [{ type: "text", text: "Rename hello to bye" }] },
          {
            id: "m-1",
            role: "assistant",
            parts: [
              { type: "text", text: "Reading the file." },
              {
                type: "tool",
                tool: {
                  id: "c1",
                  name: "read_file",
                  target: "a.txt",
                  status: "done",
                  output: "hello",
                },
              },
            ],
          },
        ],
      },
      {
        type: "tool_start",
        tool: {
          id: "c2",
          name: "edit",
          target: "a.txt",
          status: "running",
          diff: [
            { type: "del", text: "hello" },
            { type: "add", text: "bye" },
          ],
        },
      },
      { type: "tool_end", id: "c2", status: "done", output: "Edited a.txt: 1 replacement(s)" },
      {
        type: "tool_start",
        tool: { id: "c3", name: "read_file", target: "missing.txt", status: "running" },
      },
      { type: "tool_end", id: "c3", status: "error", output: "File not found: missing.txt" },
      { type: "text", delta: "All " },
      { type: "text", delta: "done." },
      { type: "done" },
    ];
    await page.route("**/api/threads/*/events", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: `retry: 600000\n\n${events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("")}`,
      }),
    );

    await registerUser(page, "thr", "Thread User");
    await startThread(page, "Rename hello to bye");
    await expect(page).toHaveURL(/\/threads\/[0-9a-f-]{36}$/);

    await expect(page.locator('[data-role="user"]')).toContainText("Rename hello to bye");
    await expect(page.getByText("Reading the file.")).toBeVisible();
    await expect(page.getByText("All done.")).toBeVisible();

    const group = page.getByRole("button", { name: /^Read 2 files, edited a file/ });
    await expect(group).toBeVisible();
    await expect(page.getByLabel("Failed")).toHaveCount(0);
    await group.click();

    const edit = page.getByRole("button", { name: /Edited.*a\.txt/ });
    await expect(edit).toBeVisible();
    await edit.click();
    await expect(page.getByText("bye", { exact: true })).toBeVisible();

    await expect(page.getByRole("button", { name: /Read.*missing\.txt/ })).toBeVisible();
    await expect(page.getByLabel("Failed")).toHaveCount(1);

    await expect(page.getByRole("textbox", { name: "Prompt" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Stop" })).toHaveCount(0);
  });

  test("a running thread shows it is working, and its composer offers Stop alone, even once there is something to say", async ({
    page,
  }) => {
    await page.route("**/api/threads/*/events", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: `retry: 600000\n\ndata: ${JSON.stringify({
          type: "snapshot",
          running: true,
          runningMs: 272_000,
          messages: [{ id: "m-0", role: "user", parts: [{ type: "text", text: "long task" }] }],
        })}\n\n`,
      }),
    );
    let cancelled = false;
    await page.route("**/api/threads/*/cancel", (route) => {
      cancelled = true;
      return route.fulfill({ json: { cancelled: true } });
    });

    await registerUser(page, "thr", "Thread User");
    await startThread(page, "long task");
    await expect(page).toHaveURL(/\/threads\/[0-9a-f-]{36}$/);

    await expect(page.getByRole("status").filter({ hasText: "Working…" })).toBeVisible();
    await expect(page.getByText(/^4m \d{1,2}s$/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Send" })).toHaveCount(0);
    await page.getByRole("textbox", { name: "Prompt" }).fill("one more thing");
    await expect(page.getByRole("button", { name: "Send" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
    await page.getByRole("button", { name: "Stop" }).click();
    await expect.poll(() => cancelled).toBe(true);
  });
});

test.describe("the working line", () => {
  test("sits under the last line of the conversation, not in the composer, and does not move when the composer grows", async ({
    page,
  }) => {
    const messages = Array.from({ length: 24 }, (_, index) => ({
      id: `m-${index}`,
      role: index % 2 === 0 ? "user" : "assistant",
      parts: [
        { type: "text", text: `Line number ${index} of a long conversation, with some words.` },
      ],
    }));
    await page.route("**/api/threads/*/events", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: `retry: 600000\n\ndata: ${JSON.stringify({ type: "snapshot", running: true, runningMs: 5000, messages })}\n\n`,
      }),
    );
    await registerUser(page, "thr", "Thread User");
    await startThread(page, "long task");
    await expect(page).toHaveURL(/\/threads\/[0-9a-f-]{36}$/);
    await page.setViewportSize({ width: 1280, height: 800 });

    const working = page.getByRole("status").filter({ hasText: "Working…" }).locator("..");
    const composer = page.getByRole("textbox", { name: "Prompt" });
    const last = page.getByText("Line number 23");
    await expect(last).toBeVisible();
    await expect(working).toBeVisible();

    const boxes = async () => ({
      line: await working.boundingBox(),
      prompt: await composer.boundingBox(),
      text: await last.boundingBox(),
    });
    const end = await boxes();
    expect(end.line!.y).toBeGreaterThanOrEqual(end.text!.y + end.text!.height - 1);
    expect(end.line!.y + end.line!.height).toBeLessThanOrEqual(end.prompt!.y + 1);

    await composer.fill(Array.from({ length: 9 }, (_, index) => `word ${index}`).join("\n"));
    await expect(async () => {
      const tall = await boxes();
      expect(tall.prompt!.height).toBeGreaterThan(end.prompt!.height + 60);
      expect(tall.text!.y + tall.text!.height).toBeLessThanOrEqual(tall.prompt!.y + 1);
      const gap = (box: typeof end) => box.line!.y - (box.text!.y + box.text!.height);
      expect(Math.abs(gap(tall) - gap(end))).toBeLessThan(2);
    }).toPass({ timeout: 5000 });
  });
});

test.describe("a message sent to an idle agent", () => {
  let runner: ChildProcess | undefined;
  test.afterEach(() => {
    runner?.kill();
    runner = undefined;
  });

  async function idleThread(page: Page) {
    await registerUser(page, "opt", "Optimistic Person");
    const provider = await page.request.post("/api/providers", {
      data: { kind: "anthropic", name: "Anthropic", apiKey: "sk-ant-test" },
    });
    expect(provider.ok()).toBe(true);
    const { child, threadId } = await threadOnFakeRunner(page, { FAKE_RUN_ENDS_AFTER: "60000" });
    runner = child;
    await page.goto(`/threads/${threadId}`);
    return threadId;
  }

  test("shows at once, before the server has it, and settles to the server's own", async ({
    page,
  }) => {
    await idleThread(page);
    await page.route("**/api/threads/*/messages", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      await new Promise((resolve) => setTimeout(resolve, 1500));
      return route.continue();
    });
    const prompt = page.getByRole("textbox", { name: "Prompt" });
    const shown = page.locator('[data-role="user"]');
    await prompt.fill("make the tests pass");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(shown).toContainText("make the tests pass", { timeout: 500 });
    await expect(shown).toHaveAttribute("aria-busy", "true");
    await expect(prompt).toHaveText("");

    await expect(shown).not.toHaveAttribute("aria-busy", "true", { timeout: 8000 });
    await expect(shown).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
  });

  test("an image shows at once as a picture, before the server has the message", async ({
    page,
  }) => {
    await idleThread(page);
    await page.route("**/api/threads/*/messages", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      await new Promise((resolve) => setTimeout(resolve, 1500));
      return route.continue();
    });
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );
    await page
      .locator('input[type="file"]')
      .setInputFiles({ name: "shot.png", mimeType: "image/png", buffer: png });
    await page.getByRole("textbox", { name: "Prompt" }).fill("what is this?");
    await page.getByRole("button", { name: "Send" }).click();

    const shown = page.locator('[data-role="user"]');
    await expect(shown).toHaveAttribute("aria-busy", "true", { timeout: 500 });
    await expect(shown.getByRole("img", { name: "shot.png" })).toHaveAttribute(
      "src",
      /^data:image\/png;base64,/,
    );
    await page.setViewportSize({ width: 1200, height: 800 });
    await shown.getByRole("button", { name: "Open shot.png" }).click();
    const dialog = page.getByRole("dialog", { name: "shot.png" });
    await expect(dialog.getByRole("img", { name: "shot.png" })).toHaveAttribute("src", /^data:/);
    await expect.poll(async () => (await dialog.boundingBox())?.width).toBeCloseTo(1200 * 0.8, -1);
    await expect.poll(async () => (await dialog.boundingBox())?.height).toBeCloseTo(800 * 0.8, -1);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);

    await expect(shown).not.toHaveAttribute("aria-busy", "true", { timeout: 8000 });
    await expect(shown.getByRole("img", { name: "shot.png" })).toHaveAttribute(
      "src",
      /\/artifacts\//,
    );
    await shown.getByRole("button", { name: "Open shot.png" }).click();
    await expect(dialog.getByRole("img", { name: "shot.png" })).toHaveAttribute(
      "src",
      /\/artifacts\//,
    );
  });

  test("a message the server refuses is taken back and the words return to the composer", async ({
    page,
  }) => {
    await page.route("**/api/threads/*/messages", (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      return route.fulfill({ status: 409, contentType: "text/plain", body: "Not like that" });
    });
    await idleThread(page);
    const prompt = page.getByRole("textbox", { name: "Prompt" });
    await prompt.fill("please build it");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByText("Not like that").first()).toBeVisible();
    await expect(page.locator('[data-role="user"]')).toHaveCount(0);
    await expect(prompt).toHaveText("please build it");
  });
});

test.describe("archiving a thread with a run going", () => {
  let runner: ChildProcess | undefined;
  test.afterEach(() => {
    runner?.kill();
    runner = undefined;
  });

  test("stops the run and frees the sandbox", async ({ page }) => {
    await registerUser(page, "arc", "Archive Person");
    const provider = await page.request.post("/api/providers", {
      data: { kind: "anthropic", name: "Anthropic", apiKey: "sk-ant-test" },
    });
    expect(provider.ok()).toBe(true);
    const { child, events, threadId } = await threadOnFakeRunner(page, {
      FAKE_RUN_ENDS_AFTER: "120000",
    });
    runner = child;
    await page.goto(`/threads/${threadId}`);
    const sent = await page.request.post(`/api/threads/${threadId}/messages`, {
      data: { prompt: "long task" },
    });
    expect(sent.ok()).toBe(true);
    await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();

    const archived = await page.request.patch(`/api/threads/${threadId}`, {
      data: { state: "archived" },
    });
    expect(archived.ok()).toBe(true);

    await expect
      .poll(
        async () => {
          const threads = (await (await page.request.get("/api/threads")).json()) as {
            id: string;
            running: boolean;
          }[];
          return threads.find((thread) => thread.id === threadId)?.running;
        },
        { timeout: 8000 },
      )
      .toBe(false);
    await expect(page.getByRole("button", { name: "Stop" })).toHaveCount(0);
    await expect
      .poll(() => events.some((event) => event.type === "sandbox.release"), { timeout: 8000 })
      .toBe(true);
    expect(events.find((event) => event.type === "sandbox.release")?.threadId).toBe(threadId);
  });
});
