import type { ChildProcess } from "node:child_process";

import { expect, test } from "@playwright/test";

import { registerUser, threadOnFakeRunner } from "./helpers";

test.describe("a thread's panels", () => {
  let runner: ChildProcess | undefined;
  test.afterEach(() => {
    runner?.kill();
    runner = undefined;
  });

  test("are open and sized per thread, not for every thread", async ({ page }) => {
    await registerUser(page, "tpn", "Panels User");
    const { child, threadId } = await threadOnFakeRunner(page);
    runner = child;
    const projects = (await (await page.request.get("/api/projects")).json()) as { id: string }[];
    const made = await page.request.post("/api/threads", { data: { projectId: projects[0]!.id } });
    const otherId = ((await made.json()) as { id: string }).id;

    await page.setViewportSize({ width: 1400, height: 800 });
    const changes = page.getByRole("region", { name: "Changes" });
    const conversationWidth = () =>
      page
        .locator('[data-slot="resizable-panel"]')
        .first()
        .evaluate((element) => Math.round(element.getBoundingClientRect().width));

    await page.goto(`/threads/${threadId}`);
    await page.getByRole("button", { name: "Changes", exact: true }).click();
    await expect(changes).toBeVisible();
    const handle = page.getByRole("separator").first();
    const box = (await handle.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, 400);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 250, 400, { steps: 8 });
    await page.mouse.up();
    const widened = await conversationWidth();

    await page.goto(`/threads/${otherId}`);
    await expect(page.getByRole("button", { name: "Changes", exact: true })).toBeVisible();
    await expect(changes).toHaveCount(0);

    await page.goto(`/threads/${threadId}`);
    await expect(changes).toBeVisible();
    await expect.poll(conversationWidth).toBe(widened);
  });
});
