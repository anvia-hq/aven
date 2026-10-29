import { expect, test, type Page } from "@playwright/test";

import { addRunner, registerUser } from "./helpers";

async function createProject(page: Page, name: string) {
  await page.getByRole("button", { name: "New project" }).click();
  await page.getByLabel("Name").fill(name);
  await page.getByRole("button", { name: "Create project" }).click();
}

// Creates a project (which is auto-selected) and sends the first prompt.
async function startThread(page: Page, prompt: string) {
  await addRunner(page);
  await createProject(page, "project");
  await page.getByLabel("Prompt").fill(prompt);
  await page.getByRole("button", { name: "Send" }).click();
}

test.describe("threads", () => {
  test("the new thread page asks to create a project first", async ({ page }) => {
    await registerUser(page, "thr", "Thread User");

    await expect(page.getByRole("heading", { name: "What should we build?" })).toBeVisible();
    await expect(page.getByText("Create a project to get started.")).toBeVisible();
    await expect(page.getByRole("region", { name: "Recent threads" })).toContainText(
      "No threads yet.",
    );
  });

  test("a project needs a runner, and the dialog says where to add one", async ({ page }) => {
    await registerUser(page, "thr", "Thread User");
    await page.getByRole("button", { name: "New project" }).click();
    await expect(page.getByText("A project needs a runner")).toBeVisible();
    await expect(page.getByRole("link", { name: "Add a runner" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Create project" })).toBeDisabled();
  });

  test("a thread started from a project opens with its prompt as the title", async ({ page }) => {
    await registerUser(page, "thr", "Thread User");
    await addRunner(page);
    await createProject(page, "project");
    await page.getByLabel("Prompt").fill("hello");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page).toHaveURL(/\/threads\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { name: "hello" })).toBeVisible();
  });

  test("a prompt without choosing a project is refused and kept", async ({ page }) => {
    await registerUser(page, "thr", "Thread User");
    await addRunner(page);
    await createProject(page, "project");
    await page.getByLabel("Prompt").fill("hello");
    await page.getByRole("button", { name: "Send" }).click();
    // `_authed`'s beforeLoad re-checks the session on every navigation, so the URL can update
    // before the route actually swaps content; wait for the thread's own content to render
    // before navigating away again, rather than racing that swap.
    await expect(page.getByRole("heading", { name: "hello" })).toBeVisible();

    // Back on the new-thread page, the project the agent just worked in is no longer pre-selected.
    await page.getByRole("button", { name: "New thread" }).click();
    await expect(page.getByLabel("Project")).toBeVisible();
    await page.getByLabel("Prompt").fill("hello again");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByText("Choose a project first")).toBeVisible();
    await expect(page).toHaveURL(/\/threads$/);
    // The refused prompt is still there to send once a project is chosen.
    await expect(page.getByLabel("Prompt")).toHaveValue("hello again");
  });

  test("creating a project opens the thread once prompted; with its runner offline the agent reports why", async ({
    page,
  }) => {
    await registerUser(page, "thr", "Thread User");
    await startThread(page, "Explain the project layout");

    await expect(page).toHaveURL(/\/threads\/[0-9a-f-]{36}$/);
    await expect(page.getByText("The runtime for this project is offline")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Explain the project layout" })).toBeVisible();
    await expect(page.locator("header").getByText("runner · offline")).toBeVisible();
    await expect(
      page.locator('[data-slot="sidebar"]').getByText("Explain the project layout"),
    ).toBeVisible();
    await expect(page.getByLabel("Prompt")).toBeEnabled();

    // The project is offered again as a shortcut for the next thread.
    await page.getByRole("button", { name: "New thread" }).click();
    await page.getByLabel("Project").click();
    await expect(page.getByRole("option", { name: "project" })).toBeVisible();
  });

  test("a thread from another organization is not found", async ({ page }) => {
    await registerUser(page, "thr", "Thread User");
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

    await registerUser(page, "thr", "Thread User");
    await startThread(page, "Rename hello to bye");
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

    await registerUser(page, "thr", "Thread User");
    await startThread(page, "long task");
    await expect(page).toHaveURL(/\/threads\/[0-9a-f-]{36}$/);

    await page.getByLabel("Prompt").fill("one more thing");
    await expect(page.getByRole("button", { name: "Send" })).toBeDisabled();
    await page.getByRole("button", { name: "Stop" }).click();
    await expect.poll(() => cancelled).toBe(true);
  });
});
