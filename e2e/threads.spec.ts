import { expect, test, type Page } from "@playwright/test";

const unique = () => `thr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@aven.test`;

// The backend runs on this machine, so the repository itself is a valid project directory.
const PROJECT_PATH = process.cwd();

async function register(page: Page) {
  await page.goto("/register");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Name").fill("Thread User");
  await page.getByLabel("Email").fill(unique());
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/threads$/);
}

async function startThread(page: Page, path: string, prompt: string) {
  await page.getByLabel("Project path").fill(path);
  await page.getByLabel("Prompt").fill(prompt);
  await page.getByRole("button", { name: "Send" }).click();
}

test.describe("threads", () => {
  test("the new thread page asks for a project path and offers suggestions", async ({ page }) => {
    await register(page);

    await expect(page.getByRole("heading", { name: "What should we build?" })).toBeVisible();
    await expect(page.getByLabel("Project path")).toBeVisible();
    await expect(page.getByLabel("Suggestions").getByRole("button")).toHaveCount(4);
    await expect(page.getByRole("region", { name: "Recent threads" })).toContainText(
      "No threads yet.",
    );
  });

  test("a prompt without a project path is refused", async ({ page }) => {
    await register(page);
    await page.getByLabel("Prompt").fill("hello");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByText("Choose a project path first")).toBeVisible();
    await expect(page).toHaveURL(/\/threads$/);
  });

  test("a path that is not an existing directory is rejected by the server", async ({ page }) => {
    await register(page);
    await startThread(page, "/definitely/not/a/real/dir", "hello");

    await expect(page.getByText("Directory does not exist")).toBeVisible();
    await expect(page).toHaveURL(/\/threads$/);

    await startThread(page, "relative/path", "hello");
    await expect(page.getByText("Project path must be an absolute path")).toBeVisible();
  });

  test("a valid path opens the thread; without a model key the agent reports why", async ({
    page,
  }) => {
    await register(page);
    await startThread(page, PROJECT_PATH, "Explain the project layout");

    await expect(page).toHaveURL(/\/threads\/[0-9a-f-]{36}$/);
    await expect(page.getByText("ANTHROPIC_API_KEY is not set")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Explain the project layout" })).toBeVisible();
    await expect(page.locator("header").getByText(PROJECT_PATH)).toBeVisible();
    await expect(
      page.locator('[data-slot="sidebar"]').getByText("Explain the project layout"),
    ).toBeVisible();
    await expect(page.getByLabel("Prompt")).toBeEnabled();

    // The path is remembered as a shortcut for the next thread.
    await page.getByRole("button", { name: "New thread" }).click();
    await expect(page.getByLabel("Recent project paths").getByRole("button")).toContainText(
      PROJECT_PATH,
    );
  });

  test("a thread from another organization is not found", async ({ page }) => {
    await register(page);
    await page.goto("/threads/00000000-0000-4000-8000-000000000000");
    await expect(page.getByRole("heading", { name: "Thread not found" })).toBeVisible();
  });

  test("the thread view renders a streamed run: tool calls, a diff, an error and the reply", async ({
    page,
  }) => {
    // Stands in for the agent's event stream so no model is needed. The snapshot is what a client
    // gets on connect; the events after it are what a live run emits.
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
                  name: "read",
                  target: "a.txt",
                  status: "done",
                  output: "Read file a.txt, lines 1-1 of 1\n1: hello",
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
        tool: { id: "c3", name: "read", target: "missing.txt", status: "running" },
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
        // A long retry stops the browser from re-requesting the stream once this one closes.
        body: `retry: 600000\n\n${events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("")}`,
      }),
    );

    await register(page);
    await startThread(page, PROJECT_PATH, "Rename hello to bye");
    await expect(page).toHaveURL(/\/threads\/[0-9a-f-]{36}$/);

    await expect(page.locator('[data-role="user"]')).toContainText("Rename hello to bye");
    await expect(page.getByText("Reading the file.")).toBeVisible();
    await expect(page.getByText("All done.")).toBeVisible();

    const edit = page.getByRole("button", { name: /Edited.*a\.txt/ });
    await expect(edit).toBeVisible();
    await edit.click();
    await expect(page.getByText("bye", { exact: true })).toBeVisible();

    await expect(page.getByRole("button", { name: /Read.*missing\.txt/ })).toBeVisible();
    await expect(page.getByLabel("Failed")).toHaveCount(1);

    // The run is over, so the prompt is usable and there is nothing to stop.
    await expect(page.getByLabel("Prompt")).toBeEnabled();
    await expect(page.getByRole("button", { name: "Stop" })).toHaveCount(0);
  });

  test("a running thread cannot take another message and offers Stop", async ({ page }) => {
    await page.route("**/api/threads/*/events", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: `retry: 600000\n\ndata: ${JSON.stringify({
          type: "snapshot",
          running: true,
          messages: [{ id: "m-0", role: "user", parts: [{ type: "text", text: "long task" }] }],
        })}\n\n`,
      }),
    );
    let cancelled = false;
    await page.route("**/api/threads/*/cancel", (route) => {
      cancelled = true;
      return route.fulfill({ json: { cancelled: true } });
    });

    await register(page);
    await startThread(page, PROJECT_PATH, "long task");
    await expect(page).toHaveURL(/\/threads\/[0-9a-f-]{36}$/);

    await page.getByLabel("Prompt").fill("one more thing");
    await expect(page.getByRole("button", { name: "Send" })).toBeDisabled();
    await page.getByRole("button", { name: "Stop" }).click();
    await expect.poll(() => cancelled).toBe(true);
  });
});
