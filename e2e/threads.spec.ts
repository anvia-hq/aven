import type { ChildProcess } from "node:child_process";
import { createServer, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import { expect, test, type Page } from "@playwright/test";

import {
  addRunner,
  connectGithub,
  importRepository,
  registerUser,
  revealToast,
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
  test("the new thread page asks to add a folder first", async ({ page }) => {
    await registerUser(page, "thr", "Thread User");

    await expect(page.getByRole("heading", { name: "What should we build?" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Project" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Recent threads" })).toContainText(
      "No threads yet.",
    );
  });

  test("hovering a thread in the sidebar offers to archive it", async ({ page }) => {
    await registerUser(page, "thr", "Thread User");
    await addRunner(page);
    await createProject(page, "project");
    await page.getByRole("textbox", { name: "Prompt" }).fill("archive me");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page).toHaveURL(/\/threads\/[0-9a-f-]{36}$/);

    const item = page.locator("[data-slot=sidebar-menu-item]", { hasText: "archive me" });
    const more = item.getByRole("button", { name: "Options for archive me" });
    await page.mouse.move(800, 400);
    await expect(item).toBeVisible();
    await expect(item.locator("time")).toHaveCount(0);
    await expect(more).toHaveCSS("opacity", "0");
    await item.getByRole("link").click();
    await page.mouse.move(800, 400);
    await expect(more).toHaveCSS("opacity", "0");
    await item.hover();
    await expect(more).toHaveCSS("opacity", "1");
    await more.click();
    await page.mouse.move(800, 400);
    await expect(more).toHaveCSS("opacity", "1");
    await page.getByRole("menuitem", { name: "Archive" }).click();

    await expect(page).toHaveURL(/\/threads$/);
    await expect(page.getByText("Thread archived")).toBeVisible();
    await expect(item).toHaveCount(0);
  });

  test("an archived thread waits under the groups until it is restored", async ({ page }) => {
    await registerUser(page, "thr", "Thread User");
    await addRunner(page);
    await createProject(page, "project");
    await page.getByRole("textbox", { name: "Prompt" }).fill("put me away");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page).toHaveURL(/\/threads\/[0-9a-f-]{36}$/);

    const item = page.locator("[data-slot=sidebar-menu-item]", { hasText: "put me away" });
    await item.hover();
    await item.getByRole("button", { name: "Options for put me away" }).click();
    await page.getByRole("menuitem", { name: "Archive" }).click();
    await expect(item).toHaveCount(0);

    const section = page.getByRole("region", { name: "Archived (1)" });
    await expect(section).toBeVisible();
    await section.getByRole("button", { name: "Archived (1)" }).click();
    await expect(item).toHaveCount(1);

    await item.hover();
    await item.getByRole("button", { name: "Options for put me away" }).click();
    await page.getByRole("menuitem", { name: "Restore" }).click();
    await expect(page.getByText("Thread restored")).toBeVisible();
    await expect(page.getByRole("region", { name: "Archived (1)" })).toHaveCount(0);
    await expect(item).toHaveCount(1);
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

  test("a new thread starts in the project of the latest one", async ({ page }) => {
    await registerUser(page, "thr", "Thread User");
    await addRunner(page);
    await createProject(page, "project");
    await page.getByRole("textbox", { name: "Prompt" }).fill("hello");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByRole("heading", { name: "hello" })).toBeVisible();

    await page.getByRole("button", { name: "New thread" }).click();
    await expect(page.getByRole("button", { name: "Project" })).toContainText("project");
    await page.getByRole("textbox", { name: "Prompt" }).fill("hello again");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByRole("heading", { name: "hello again" })).toBeVisible();
    await expect(page).toHaveURL(/\/threads\/[0-9a-f-]{36}$/);
  });

  test("creating a project opens the thread once prompted; with its runner offline the agent reports why", async ({
    page,
  }) => {
    await registerUser(page, "thr", "Thread User");
    await startThread(page, "Explain the project layout");

    await expect(page).toHaveURL(/\/threads\/[0-9a-f-]{36}$/);
    await revealToast(page, "The runtime for this project is offline");
    await expect(page.getByText("The runtime for this project is offline")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Explain the project layout" })).toBeVisible();
    await expect(
      page.locator('[data-slot="sidebar"]').getByText("Explain the project layout"),
    ).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Prompt" })).toBeEnabled();

    await page.getByRole("button", { name: "New thread" }).click();
    await page.getByRole("button", { name: "Project", exact: true }).click();
    await expect(page.getByRole("button", { name: "project acme/project" })).toBeVisible();
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
    const box = page.locator("div.rounded-3xl", { has: prompt });
    const area = await prompt.boundingBox();
    const outer = await box.boundingBox();
    expect(area && outer).toBeTruthy();

    await page.mouse.click(area!.x + area!.width / 2, area!.y + area!.height - 6);
    await expect(prompt).toBeFocused();
    await page.keyboard.type("hello");
    await expect(prompt).toContainText("hello");

    await prompt.blur();
    await page.mouse.click(outer!.x + 10, outer!.y + 10);
    await expect(prompt).toBeFocused();
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

    await expect(page.getByText("Up to date.")).toBeVisible();
    const worked = page.locator('[data-role="worked"]');
    await expect(worked).toHaveAttribute("aria-expanded", "false");
    await worked.click();

    const row = page.getByRole("button", { name: "Fetched default branch" });
    await expect(row).toBeVisible();
    await row.click();
    const call = page.getByRole("button", { name: /Fetched.*default branch/ }).nth(1);
    await expect(call).toBeVisible();
    await call.click();
    await expect(page.getByText("origin/main is now at bbbbbbb (was aaaaaaa).")).toBeVisible();
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

  test("each recency group in the sidebar opens and closes, and is remembered after a reload", async ({
    page,
  }) => {
    await registerUser(page, "grp", "Group User");
    const today = page.getByRole("button", { name: "Today" });
    const week = page.getByRole("button", { name: "Last 7 days" });
    await expect(page.getByRole("button", { name: "Last 30 days" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await expect(today).toHaveAttribute("aria-expanded", "true");

    await today.click();
    await expect(today).toHaveAttribute("aria-expanded", "false");
    await expect(week).toHaveAttribute("aria-expanded", "true");

    await page.reload();
    await expect(today).toHaveAttribute("aria-expanded", "false");
    await expect(week).toHaveAttribute("aria-expanded", "true");

    await today.click();
    await expect(today).toHaveAttribute("aria-expanded", "true");
    await page.reload();
    await expect(today).toHaveAttribute("aria-expanded", "true");
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
      { type: "done", workedMs: 124_000 },
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
    await expect(page.getByText("All done.")).toBeVisible();
    await expect(page.locator('[data-role="worked"]')).toHaveText("Worked for 2m 4s");
    await expect(page.getByText("Reading the file.")).toBeHidden();
    await page.locator('[data-role="worked"]').click();
    await expect(page.getByText("Reading the file.")).toBeVisible();

    const readFirstRow = page.getByRole("button", { name: /Explored a\.txt/ });
    await expect(readFirstRow).toBeVisible();
    await readFirstRow.click();
    await page
      .getByRole("button", { name: /Read.*a\.txt/ })
      .first()
      .click();

    const patchRow = page.getByRole("button", { name: /Patched a\.txt/ });
    await expect(patchRow).toBeVisible();
    await patchRow.click();

    const edit = page.getByRole("button", { name: /Edited.*a\.txt/ });
    await expect(edit).toBeVisible();
    await edit.click();
    await expect(page.getByText("bye", { exact: true })).toBeVisible();

    const missingRow = page.getByRole("button", { name: /Explored missing\.txt/ });
    await expect(missingRow).toBeVisible();
    await missingRow.click();

    const missing = page.getByRole("button", { name: /Read.*missing\.txt/ });
    await expect(missing).toBeVisible();
    await expect(page.getByLabel("Failed")).toHaveCount(1);
    await missing.click();
    await expect(page.getByText("File not found: missing.txt", { exact: true })).toBeVisible();

    await expect(page.getByRole("textbox", { name: "Prompt" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Stop" })).toHaveCount(0);
  });

  test("caps live timeline rows to four while running and shows a collapsible floating plan", async ({
    page,
  }) => {
    const tools = [
      { id: "t1", name: "edit", target: "src/one.ts", status: "done", output: "ok" },
      { id: "t2", name: "edit", target: "src/two.ts", status: "done", output: "ok" },
      { id: "t3", name: "edit", target: "src/three.ts", status: "done", output: "ok" },
      { id: "t4", name: "edit", target: "src/four.ts", status: "done", output: "ok" },
      { id: "t5", name: "edit", target: "src/five.ts", status: "done", output: "ok" },
      {
        id: "td1",
        name: "todo_write",
        target: "1/2 done",
        status: "done",
        output: "Task list (1/2 done):\n[x] Patch files\n[~] Verify build",
      },
    ];
    await page.route("**/api/threads/*/events", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: `retry: 600000\n\ndata: ${JSON.stringify({
          type: "snapshot",
          running: true,
          messages: [
            { id: "m-0", role: "user", parts: [{ type: "text", text: "Patch five files" }] },
            {
              id: "m-1",
              role: "assistant",
              parts: tools.map((tool) => ({ type: "tool", tool })),
            },
          ],
        })}\n\n`,
      }),
    );

    await registerUser(page, "thr", "Thread User");
    await startThread(page, "Patch five files");
    await expect(page).toHaveURL(/\/threads\/[0-9a-f-]{36}$/);

    const timeline = page.locator('[data-role="timeline"]');
    const parent = timeline.locator('[data-role="timeline-parent"]');
    await expect(parent.getByRole("button", { name: "Edited 3 files" })).toBeVisible();
    await expect(
      timeline.locator('[data-role="timeline-viewport"] [data-role="timeline-row"]'),
    ).toHaveCount(3);
    await expect(timeline.getByText("Patched src/five.ts")).toBeVisible();
    await expect(timeline.getByText("Patched src/one.ts")).toBeHidden();

    await parent.getByRole("button", { name: "Edited 3 files" }).click();
    await expect(timeline.getByText("Patched src/one.ts")).toBeVisible();

    const plan = page.locator('[data-role="plan-card"]');
    await expect(plan).toBeVisible();
    await expect(plan.getByText("Patch files")).toBeVisible();
    await expect(plan.getByText("Verify build")).toBeVisible();

    await plan.getByRole("button").click();
    await expect(plan.getByText("Patch files")).toBeHidden();
    await expect(plan.getByRole("button")).toContainText("Verify build");
    await expect(plan.getByRole("button")).toContainText("1/2");
  });

  test("collapses tool calls into one collapsible parent line as soon as text starts streaming", async ({
    page,
  }) => {
    const tools = [
      { id: "t1", name: "exec_command", target: "bun test", status: "done", output: "4 pass" },
      { id: "t2", name: "edit", target: "src/app.ts", status: "done", output: "ok" },
    ];
    await page.route("**/api/threads/*/events", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: `retry: 600000\n\ndata: ${JSON.stringify({
          type: "snapshot",
          running: true,
          messages: [
            { id: "m-0", role: "user", parts: [{ type: "text", text: "Fix and verify" }] },
            {
              id: "m-1",
              role: "assistant",
              parts: [
                ...tools.map((tool) => ({ type: "tool", tool })),
                { type: "text", text: "Streaming the summary now." },
              ],
            },
          ],
        })}\n\n`,
      }),
    );

    await registerUser(page, "thr", "Thread User");
    await startThread(page, "Fix and verify");
    await expect(page).toHaveURL(/\/threads\/[0-9a-f-]{36}$/);

    await expect(page.getByText("Streaming the summary now.")).toBeVisible();
    const worked = page.locator('[data-role="worked"]');
    await expect(worked).toHaveText("Ran a command, edited a file");
    await expect(worked).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByText("Patched src/app.ts")).toBeHidden();

    await worked.click();
    await expect(page.getByText("Patched src/app.ts")).toBeVisible();
  });

  test("keeps a live tool timeline unified across a background process wake", async ({ page }) => {
    const firstBatch = [
      { id: "t1", name: "edit", target: "src/one.ts", status: "done", output: "ok" },
      { id: "t2", name: "edit", target: "src/two.ts", status: "done", output: "ok" },
      { id: "t3", name: "edit", target: "src/three.ts", status: "done", output: "ok" },
      { id: "t4", name: "edit", target: "src/four.ts", status: "done", output: "ok" },
      { id: "t5", name: "start_process", target: "bun dev", status: "done", output: "started" },
    ];
    const secondBatch = [
      { id: "t6", name: "exec_command", target: "curl /health", status: "done", output: "ok" },
      { id: "t7", name: "exec_command", target: "bun test", status: "running" },
    ];
    await page.route("**/api/threads/*/events", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: `retry: 600000\n\ndata: ${JSON.stringify({
          type: "snapshot",
          running: true,
          messages: [
            { id: "m-0", role: "user", parts: [{ type: "text", text: "Start and verify" }] },
            {
              id: "m-1",
              role: "assistant",
              parts: firstBatch.map((tool) => ({ type: "tool", tool })),
            },
            {
              id: "m-2",
              role: "user",
              parts: [
                {
                  type: "text",
                  text: "[process] Process proc-1 (bun dev) ended with exit code 0 after 2s.",
                },
              ],
            },
            {
              id: "m-3",
              role: "assistant",
              parts: secondBatch.map((tool) => ({ type: "tool", tool })),
            },
          ],
        })}\n\n`,
      }),
    );

    await registerUser(page, "thr", "Thread User");
    await startThread(page, "Start and verify");
    await expect(page).toHaveURL(/\/threads\/[0-9a-f-]{36}$/);

    const timelines = page.locator('[data-role="timeline"]');
    await expect(timelines).toHaveCount(1);
    await expect(
      timelines.locator('[data-role="timeline-viewport"] [data-role="timeline-row"]'),
    ).toHaveCount(3);
    const parentButton = timelines.locator('[data-role="timeline-parent"]').getByRole("button");
    await expect(parentButton).toHaveText("Edited 4 files");
    await expect(timelines.getByText("Patched src/one.ts")).toBeHidden();
    await expect(timelines.getByText("Running tests")).toBeVisible();

    const [parentTextLeft, rowTextLeft, workingTextLeft, workingWord] = await page.evaluate(() => {
      const parentLabel = document.querySelector<HTMLElement>(
        '[data-role="timeline-parent"] button > span',
      );
      const rowLabel = document.querySelector<HTMLElement>(
        '[data-role="timeline-viewport"] [data-role="timeline-row"] button > span',
      );
      const workingLabel = document.querySelector<HTMLElement>(
        '[data-role="working"] [data-role="working-label"]',
      );
      return [
        parentLabel?.getBoundingClientRect().left ?? -1,
        rowLabel?.getBoundingClientRect().left ?? -2,
        workingLabel?.getBoundingClientRect().left ?? -3,
        workingLabel?.textContent ?? "",
      ];
    });
    expect(Math.abs(parentTextLeft - rowTextLeft)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(workingTextLeft - rowTextLeft)).toBeLessThanOrEqual(0.5);
    expect(workingWord).toMatch(/^[A-Z][a-z]+…$/);
    expect(workingWord).not.toBe("Working…");
  });

  test("pushes older live tool rows into the parent group with zero working-indicator shift", async ({
    page,
  }) => {
    const clients = new Set<ServerResponse>();
    const backlog: string[] = [];
    const server = createServer((_req, res) => {
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
        "access-control-allow-origin": "*",
      });
      res.write("retry: 600000\n\n");
      for (const chunk of backlog) res.write(chunk);
      clients.add(res);
      res.on("close", () => clients.delete(res));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;
    const push = (event: unknown) => {
      const chunk = `data: ${JSON.stringify(event)}\n\n`;
      backlog.push(chunk);
      for (const client of clients) client.write(chunk);
    };

    try {
      await page.route("**/api/threads/*/events", (route) =>
        route.continue({ url: `http://127.0.0.1:${port}/events` }),
      );

      await registerUser(page, "thr", "Thread User");
      await startThread(page, "Run six commands");
      await expect(page).toHaveURL(/\/threads\/[0-9a-f-]{36}$/);

      const makeTool = (index: number) => ({
        id: `c${index}`,
        name: "exec_command",
        target: `echo step-${index}`,
        status: "done",
        output: `step-${index}`,
      });

      const snapshotWith = (count: number) => ({
        type: "snapshot",
        running: true,
        messages: [
          { id: "m-0", role: "user", parts: [{ type: "text", text: "Run six commands" }] },
          {
            id: "m-1",
            role: "assistant",
            parts: Array.from({ length: count }, (_, i) => ({
              type: "tool",
              tool: makeTool(i + 1),
            })),
          },
        ],
      });

      push(snapshotWith(4));
      const timeline = page.locator('[data-role="timeline"]');
      await expect(timeline.locator('[data-role="timeline-row"]')).toHaveCount(4);
      await expect(timeline.locator('[data-role="timeline-parent"]')).toHaveCount(0);

      const row4Handle = await page.evaluateHandle(() => {
        const rows = [...document.querySelectorAll('[data-role="timeline-row"]')];
        const row = rows.find((el) => el.textContent?.includes("echo step-4")) ?? null;
        return { row, label: row?.querySelector("button > span") ?? null };
      });

      const working = page.locator('[data-role="working"]');
      await expect(working).toBeVisible();
      const topAt4 = await working.evaluate((el) => el.getBoundingClientRect().top);

      push(snapshotWith(5));
      await expect(
        timeline.locator('[data-role="timeline-parent"]').getByRole("button"),
      ).toHaveText("Ran 2 commands");
      const topAt5 = await working.evaluate((el) => el.getBoundingClientRect().top);
      expect(Math.abs(topAt5 - topAt4)).toBeLessThanOrEqual(1);

      push({
        type: "narration",
        narration: { toolId: "c4", label: "Completed step four" },
      });
      await expect(timeline.getByText("Completed step four")).toBeVisible();
      const preserved = await page.evaluate(({ row, label }) => {
        const rows = [...document.querySelectorAll('[data-role="timeline-row"]')];
        const currentRow = rows.find((el) => el.textContent?.includes("Completed step four"));
        const currentLabel = currentRow?.querySelector("button > span");
        return { sameRow: currentRow === row, sameLabel: currentLabel === label };
      }, row4Handle);
      await row4Handle.dispose();
      expect(preserved).toEqual({ sameRow: true, sameLabel: true });

      push(snapshotWith(6));
      await expect(
        timeline.locator('[data-role="timeline-parent"]').getByRole("button"),
      ).toHaveText("Ran 3 commands");
      await expect(
        timeline.locator('[data-role="timeline-viewport"] [data-role="timeline-row"]'),
      ).toHaveCount(3);
      await expect(timeline.getByText("echo step-6")).toBeVisible();
      await expect(timeline.getByText("echo step-3")).toBeHidden();
      const topAt6 = await working.evaluate((el) => el.getBoundingClientRect().top);
      expect(Math.abs(topAt6 - topAt4)).toBeLessThanOrEqual(1);
    } finally {
      for (const client of clients) client.end();
      server.close();
    }
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
    await expect(shown).toHaveCSS("opacity", "1");
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
    let artifactRequests = 0;
    await page.route("**/api/threads/*/artifacts/*", (route) => {
      artifactRequests += 1;

      if (artifactRequests <= 2) return route.fulfill({ status: 404, body: "not yet" });

      return route.fulfill({ status: 200, contentType: "image/png", body: png });
    });
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
    await expect(shown.getByRole("img", { name: "shot.png" })).toHaveJSProperty("complete", true);
    await expect(shown.getByRole("img", { name: "shot.png" })).toHaveAttribute("loading", "eager");
    await page.setViewportSize({ width: 1200, height: 800 });
    await shown.getByRole("button", { name: "Open shot.png" }).click();
    const dialog = page.getByRole("dialog", { name: "shot.png" });
    await expect(dialog.getByRole("img", { name: "shot.png" })).toHaveAttribute("src", /^data:/);
    await expect.poll(async () => (await dialog.boundingBox())?.width).toBeCloseTo(1200 * 0.8, -1);
    await expect.poll(async () => (await dialog.boundingBox())?.height).toBeCloseTo(800 * 0.8, -1);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);

    await expect(shown).not.toHaveAttribute("aria-busy", "true", { timeout: 8000 });
    await expect(shown).toHaveCount(1);
    await expect(shown.getByRole("img", { name: "shot.png" })).toHaveAttribute(
      "src",
      /^data:image\/png;base64,/,
    );
    await expect.poll(() => artifactRequests).toBeGreaterThanOrEqual(2);
    await expect(shown.getByRole("img", { name: "shot.png" })).toHaveAttribute(
      "src",
      /\/artifacts\//,
      { timeout: 8000 },
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

    await revealToast(page, "Not like that");
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
