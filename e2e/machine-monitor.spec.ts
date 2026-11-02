import { spawn, type ChildProcess } from "node:child_process";

import { expect, test, type Page } from "@playwright/test";

import { registerUser } from "./helpers";

const API_URL = "http://localhost:8100";
const GB = 1024 ** 3;

const children: ChildProcess[] = [];
test.afterEach(() => {
  for (const child of children.splice(0)) child.kill();
});

// A runner of the organization that connects with `env`; with FAKE_STATS it reports its load.
async function runner(page: Page, name: string, env: Record<string, string> = {}) {
  const created = await page.request.post("/api/runtimes", { data: { name } });
  const { runtime, token } = (await created.json()) as { runtime: { id: string }; token: string };
  children.push(
    spawn("bun", ["e2e/fake-runner.ts"], {
      env: { ...process.env, AVEN_URL: API_URL, AVEN_RUNTIME_TOKEN: token, ...env },
      stdio: "ignore",
    }),
  );
  await expect(async () => {
    const list = (await (await page.request.get("/api/runtimes")).json()) as {
      id: string;
      online: boolean;
    }[];
    expect(list.find((entry) => entry.id === runtime.id)?.online).toBe(true);
  }).toPass({ timeout: 10_000 });
}

const stats = (overrides: Record<string, unknown>) =>
  JSON.stringify({
    cores: 4,
    cpuPercent: 58,
    memoryUsedBytes: 6 * GB,
    memoryTotalBytes: 16 * GB,
    diskUsedBytes: 74 * GB,
    diskTotalBytes: 98 * GB,
    sandboxes: 2,
    ...overrides,
  });

test.describe("machine monitor", () => {
  test("settings starts with a row for each runtime: its load, and the arrows go through CPU, memory and disk", async ({
    page,
  }) => {
    await registerUser(page, "mon", "Monitor User");
    await runner(page, "build-box", { FAKE_STATS: stats({}) });
    await runner(page, "hot-box", { FAKE_STATS: stats({ cpuPercent: 96, sandboxes: 1 }) });
    await runner(page, "old-box");
    await page.request.post("/api/runtimes", { data: { name: "sleeping-box" } });

    await page.goto("/settings/profile");
    const machines = page.getByRole("list", { name: "Machines" });
    const rows = machines.locator("[data-slot=machine-row]");
    // One row each, the online ones first and each group oldest first, and above the pages of settings.
    await expect(rows).toHaveCount(4);
    expect(
      await rows.evaluateAll((items) => items.map((item) => item.getAttribute("aria-label"))),
    ).toEqual(["build-box", "hot-box", "old-box", "sleeping-box"]);
    const first = await machines.boundingBox();
    const profile = await page.getByRole("link", { name: "Profile" }).boundingBox();
    expect(first!.y).toBeLessThan(profile!.y);

    // A runner that reports: CPU first, then the arrows, and the sandboxes it holds.
    const build = machines.getByRole("listitem", { name: "build-box" });
    await expect(build).toContainText("58%");
    await expect(build).toContainText("2 sandboxes running");
    await expect(build).toContainText("4 cores");
    await expect(build.getByRole("meter")).toHaveAttribute("aria-valuenow", "58");
    await expect(build.locator("[data-filled]")).toHaveCount(16);
    await build.getByRole("button", { name: "Next measure" }).click();
    await expect(build).toContainText("Memory");
    await expect(build).toContainText("38%");
    await expect(build).toContainText("6.0 of 16.0 GB");
    await build.getByRole("button", { name: "Next measure" }).click();
    await expect(build).toContainText("Disk");
    await expect(build).toContainText("76%");
    await build.getByRole("button", { name: "Next measure" }).click();
    await expect(build).toContainText("CPU");
    await build.getByRole("button", { name: "Previous measure" }).click();
    await expect(build).toContainText("Disk");

    // Nearly full is drawn as a warning; a runner that does not report, and one that is off, say so.
    const hot = machines.getByRole("listitem", { name: "hot-box" });
    await expect(hot).toContainText("96%");
    await expect(hot.locator("[data-filled]").first()).toHaveClass(/bg-destructive/);
    await expect(build.locator("[data-filled]").first()).toHaveClass(/bg-meter/);
    await expect(machines.getByRole("listitem", { name: "old-box" })).toContainText(
      "Waiting for the runner to report its load",
    );
    await expect(machines.getByRole("listitem", { name: "sleeping-box" })).toContainText("Offline");

    // Details goes to the runtimes page.
    await build.getByRole("link", { name: "Details" }).click();
    await expect(page).toHaveURL(/\/settings\/runtimes$/);
  });
});
