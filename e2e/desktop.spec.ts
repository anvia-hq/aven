import { spawn, type ChildProcess } from "node:child_process";

import { expect, test, type Page } from "@playwright/test";

import { connectGithub, importRepository, registerUser } from "./helpers";

const API_URL = "http://localhost:8100";

// A runner with a pretend desktop (e2e/fake-runner.ts), connected as the organization's own, and a
// thread on a project that uses it.
async function threadOnFakeRunner(page: Page, env: Record<string, string> = {}) {
  const created = await page.request.post("/api/runtimes", { data: { name: "fake desktop" } });
  const { runtime, token } = (await created.json()) as { runtime: { id: string }; token: string };
  const child = spawn("bun", ["e2e/fake-runner.ts"], {
    env: { ...process.env, AVEN_URL: API_URL, AVEN_RUNTIME_TOKEN: token, ...env },
  });
  const events: { type: string; [key: string]: unknown }[] = [];
  child.stdout.on("data", (chunk: Buffer) => {
    for (const line of String(chunk).split("\n")) {
      if (line.startsWith("EVENT ")) events.push(JSON.parse(line.slice(6)));
    }
  });
  await expect(async () => {
    const list = (await (await page.request.get("/api/runtimes")).json()) as {
      id: string;
      online: boolean;
    }[];
    expect(list.find((entry) => entry.id === runtime.id)?.online).toBe(true);
  }).toPass({ timeout: 10_000 });

  await connectGithub(page);
  await importRepository(page, "shiny-app");
  const projects = (await (await page.request.get("/api/projects")).json()) as { id: string }[];
  const made = await page.request.post("/api/threads", { data: { projectId: projects[0]!.id } });
  const thread = (await made.json()) as { id: string };
  return { child, events, threadId: thread.id };
}

test.describe("a thread's desktop", () => {
  let runner: ChildProcess | undefined;
  test.afterEach(() => {
    runner?.kill();
    runner = undefined;
  });

  test("is watched read-only, and a click only reaches it after taking over", async ({ page }) => {
    await registerUser(page, "dsk", "Desktop User");
    const { child, events, threadId } = await threadOnFakeRunner(page);
    runner = child;

    await page.goto(`/threads/${threadId}`);
    const panel = page.getByRole("region", { name: "Desktop" });
    await expect(panel.getByText("Watching. Take over to click and type.")).toBeVisible();

    // The pretend desktop is all red; noVNC draws it on a canvas.
    const canvas = panel.locator("canvas");
    await expect(canvas).toBeVisible();
    await expect(async () => {
      const pixel = await canvas.evaluate((element) => {
        const context = (element as HTMLCanvasElement).getContext("2d")!;
        return Array.from(context.getImageData(10, 10, 1, 1).data);
      });
      expect(pixel).toEqual([255, 0, 0, 255]);
    }).toPass({ timeout: 10_000 });

    // Watching sends nothing to the desktop.
    await canvas.click({ position: { x: 50, y: 50 } });
    await page.waitForTimeout(500);
    expect(events.filter((entry) => entry.type === "pointer")).toEqual([]);

    await panel.getByRole("button", { name: "Take over" }).click();
    await expect(
      panel.getByText("You are in control. The agent's inputs are paused."),
    ).toBeVisible();
    await expect.poll(() => events.some((entry) => entry.type === "takeover")).toBe(true);

    await canvas.click({ position: { x: 50, y: 50 } });
    await expect.poll(() => events.some((entry) => entry.type === "pointer")).toBe(true);

    await panel.getByRole("button", { name: "Give back" }).click();
    await expect(panel.getByText("Watching. Take over to click and type.")).toBeVisible();
    await expect.poll(() => events.some((entry) => entry.type === "release")).toBe(true);
  });

  test("says when the thread's sandbox is not running", async ({ page }) => {
    await registerUser(page, "dsk", "Desktop User");
    const { child, threadId } = await threadOnFakeRunner(page, { NO_SANDBOX: "1" });
    runner = child;

    await page.goto(`/threads/${threadId}`);

    const panel = page.getByRole("region", { name: "Desktop" });
    await expect(panel.getByText("The thread's sandbox is not running.")).toBeVisible();
    await expect(panel.locator("canvas")).toHaveCount(0);
    await expect(panel.getByRole("button", { name: "Take over" })).toHaveCount(0);
  });

  test("can be closed and opened again from the thread header", async ({ page }) => {
    await registerUser(page, "dsk", "Desktop User");
    const { child, threadId } = await threadOnFakeRunner(page);
    runner = child;

    await page.goto(`/threads/${threadId}`);
    const toggle = page.getByRole("button", { name: "Desktop", exact: true });
    await expect(page.getByRole("region", { name: "Desktop" })).toBeVisible();

    await toggle.click();
    await expect(page.getByRole("region", { name: "Desktop" })).toHaveCount(0);
    await toggle.click();
    await expect(page.getByRole("region", { name: "Desktop" })).toBeVisible();
  });
});
