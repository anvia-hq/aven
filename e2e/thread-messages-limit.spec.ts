import type { ChildProcess } from "node:child_process";

import { expect, test } from "@playwright/test";

import { registerUser, threadOnFakeRunner } from "./helpers";

const said = (id: string, role: "user" | "assistant", text: string) => ({
  id,
  role,
  parts: [{ type: "text", text }],
});

test.describe("a long thread", () => {
  let runner: ChildProcess | undefined;
  test.afterEach(() => {
    runner?.kill();
    runner = undefined;
  });

  test("opens on its latest messages and shows the earlier ones when asked", async ({ page }) => {
    await registerUser(page, "lim", "Limit User");
    const { child, threadId } = await threadOnFakeRunner(page);
    runner = child;
    await page.route("**/api/threads/*/events", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: `retry: 600000\n\ndata: ${JSON.stringify({
          type: "snapshot",
          running: false,
          hidden: 4,
          messages: [
            said("m-0", "user", "newest question"),
            said("m-1", "assistant", "newest answer"),
          ],
        })}\n\n`,
      }),
    );
    const asked: string[] = [];
    await page.route("**/api/threads/*/messages?before=*", (route) => {
      asked.push(new URL(route.request().url()).searchParams.get("before") ?? "");
      return route.fulfill({
        json: {
          hidden: 0,
          messages: [
            said("e-0", "user", "oldest question"),
            said("e-1", "assistant", "oldest answer"),
            said("e-2", "user", "older question"),
            said("e-3", "assistant", "older answer"),
          ],
        },
      });
    });

    await page.goto(`/threads/${threadId}`);
    await expect(page.getByText("newest answer")).toBeVisible();
    await expect(page.getByText("oldest question")).toHaveCount(0);

    await page.getByRole("button", { name: "Show earlier messages (4)" }).click();

    await expect(page.getByText("oldest question")).toBeVisible();
    await expect(page.getByText("older answer")).toBeVisible();
    await expect(page.getByText("newest answer")).toBeVisible();
    await expect(page.getByRole("button", { name: /Show earlier messages/ })).toHaveCount(0);
    expect(asked).toEqual(["4"]);
  });

  test("the server says nothing is hidden for a thread that is short", async ({ page }) => {
    await registerUser(page, "lim2", "Limit Short");
    const { child, threadId } = await threadOnFakeRunner(page);
    runner = child;
    const thread = await (await page.request.get(`/api/threads/${threadId}`)).json();
    expect(thread).toMatchObject({ messages: [], hidden: 0 });
    const earlier = await page.request.get(`/api/threads/${threadId}/messages?before=50`);
    expect(await earlier.json()).toEqual({ messages: [], hidden: 0 });
    const bad = await page.request.get(`/api/threads/${threadId}/messages?before=-1`);
    expect(bad.status()).toBe(422);
  });
});
