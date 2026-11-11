import { spawn, type ChildProcess } from "node:child_process";

import { expect, test, type Page } from "@playwright/test";

import { fakeRunnerProcessEnv } from "./fake-runner-config";
import { registerUser } from "./helpers";

const API_URL = "http://localhost:8100";
const GB = 1024 ** 3;

const children: ChildProcess[] = [];
test.afterEach(() => {
  for (const child of children.splice(0)) child.kill();
});

async function runner(page: Page, name: string, env: Record<string, string> = {}) {
  const created = await page.request.post("/api/runtimes", { data: { name } });
  const { runtime, token } = (await created.json()) as { runtime: { id: string }; token: string };
  children.push(
    spawn("bun", ["e2e/fake-runner.ts"], {
      env: fakeRunnerProcessEnv(
        { ...process.env, AVEN_URL: API_URL, AVEN_RUNTIME_TOKEN: token },
        env,
      ),
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
  test("the sidebar has a single row for each runtime above Settings, with its load", async ({
    page,
  }) => {
    await registerUser(page, "mon", "Monitor User");
    await runner(page, "build-box", { FAKE_STATS: stats({}) });
    await runner(page, "hot-box", { FAKE_STATS: stats({ cpuPercent: 96, sandboxes: 1 }) });
    await runner(page, "old-box");
    await page.request.post("/api/runtimes", { data: { name: "sleeping-box" } });

    await page.goto("/threads");
    const machines = page.getByRole("list", { name: "Machines" });
    const rows = machines.locator("[data-slot=machine-row]");
    await expect(rows).toHaveCount(4);
    expect(
      await rows.evaluateAll((items) => items.map((item) => item.getAttribute("aria-label"))),
    ).toEqual(["build-box", "hot-box", "old-box", "sleeping-box"]);
    const settings = await page.getByRole("button", { name: "Settings" }).boundingBox();
    const last = await rows.last().boundingBox();
    expect(last!.y + last!.height).toBeLessThanOrEqual(settings!.y);
    for (const box of await Promise.all((await rows.all()).map((row) => row.boundingBox()))) {
      expect(box!.height).toBeLessThanOrEqual(34);
    }

    const build = machines.getByRole("listitem", { name: "build-box" });
    const busiest = build.getByRole("meter");
    await expect(busiest).toHaveCount(1);
    await expect(busiest).toHaveAccessibleName("Disk of build-box");
    await expect(busiest).toHaveAttribute("aria-valuenow", "76");
    await expect(busiest).toHaveAttribute("data-level", "busy");
    await expect(build).toContainText("DSK76%");
    await expect(build).not.toContainText("MEM");

    await expect(
      machines.getByRole("listitem", { name: "hot-box" }).getByRole("meter"),
    ).toHaveAttribute("data-level", "high");

    await machines.screenshot({ path: ".aven/proof/machine-row/after.png" });
    await expect(machines.getByRole("listitem", { name: "old-box" })).toContainText("Waiting");
    await expect(machines.getByRole("listitem", { name: "sleeping-box" })).toContainText("Offline");

    await build.hover();
    const tip = page.locator('[data-slot="tooltip-content"]');
    await expect(tip).toContainText("Memory: 38%, 6.0 of 16.0 GB");
    await expect(tip).toContainText("Disk: 76%, 74.0 of 98.0 GB");
    await expect(tip).toContainText("4 cores");
    await expect(tip).toContainText("2 sandboxes running");

    await page.goto("/bot");
    await expect(rows).toHaveCount(4);
    await build.click();
    await expect(page).toHaveURL(/\/settings\/runtimes$/);
  });

  test("the machines are a stack that fans out upward on hover and does not move the sidebar", async ({
    page,
  }) => {
    await registerUser(page, "stack", "Stack User");
    await runner(page, "build-box", { FAKE_STATS: stats({}) });
    await runner(page, "hot-box", { FAKE_STATS: stats({ cpuPercent: 96 }) });
    await runner(page, "old-box");

    await page.goto("/threads");
    const machines = page.getByRole("list", { name: "Machines" });
    const rows = machines.locator("[data-slot=machine-row]");
    await expect(rows).toHaveCount(3);
    const settings = page.getByRole("button", { name: "Settings" });
    const settingsAt = await settings.boundingBox();
    const stackedFirst = await rows.nth(0).boundingBox();
    const stackedLast = await rows.nth(2).boundingBox();
    expect(stackedLast!.y - stackedFirst!.y).toBeLessThan(20);

    await rows.nth(0).hover();
    await expect
      .poll(async () => {
        const first = await rows.nth(0).boundingBox();
        const last = await rows.nth(2).boundingBox();
        return last!.y - first!.y;
      })
      .toBeGreaterThanOrEqual(70);
    expect(await settings.boundingBox()).toEqual(settingsAt);
    const fannedLast = await rows.nth(2).boundingBox();
    expect(fannedLast!.y + fannedLast!.height).toBeLessThanOrEqual(settingsAt!.y);
  });

  test("a runner behind the server has an Update button that asks it, and says Updating (decision 0146)", async ({
    page,
  }) => {
    await registerUser(page, "upd", "Update User");
    await runner(page, "old-box", { FAKE_BUILD: "9.9.0", FAKE_CAN_UPDATE: "1" });
    await runner(page, "current-box", { FAKE_BUILD: "9.9.9", FAKE_CAN_UPDATE: "1" });
    await runner(page, "dev-box", { FAKE_BUILD: "9.9.0" });

    await page.goto("/threads");
    const machines = page.getByRole("list", { name: "Machines" });
    await expect(machines.getByRole("button", { name: "Update old-box" })).toBeVisible();
    await expect(machines.getByRole("button", { name: "Update current-box" })).toHaveCount(0);
    await expect(machines.getByRole("button", { name: "Update dev-box" })).toHaveCount(0);

    await machines.getByRole("button", { name: "Update old-box" }).click();
    const dialog = page.getByRole("dialog", { name: "Update old-box?" });
    await expect(dialog).toContainText("restarts for a moment");
    await dialog.getByRole("button", { name: "Update", exact: true }).click();
    await expect(machines.getByRole("listitem", { name: "old-box" })).toContainText("Updating…");
    await expect(machines.getByRole("button", { name: "Update old-box" })).toHaveCount(0);

    await page.reload();
    await expect(machines.getByRole("listitem", { name: "old-box" })).toContainText("Updating…");
  });

  test("a runner that is busy says so and keeps its button", async ({ page }) => {
    await registerUser(page, "bsy", "Busy User");
    await runner(page, "busy-box", {
      FAKE_BUILD: "9.9.0",
      FAKE_CAN_UPDATE: "1",
      FAKE_UPDATE_BUSY: "A run is going on this runner. Try again when it has finished.",
    });

    await page.goto("/threads");
    const machines = page.getByRole("list", { name: "Machines" });
    await machines.getByRole("button", { name: "Update busy-box" }).click();
    await page
      .getByRole("dialog", { name: "Update busy-box?" })
      .getByRole("button", { name: "Update", exact: true })
      .click();
    await expect(page.getByText("A run is going on this runner")).toBeVisible();
    await page
      .getByRole("dialog", { name: "Update busy-box?" })
      .getByRole("button", { name: "Cancel" })
      .click();
    await expect(machines.getByRole("button", { name: "Update busy-box" })).toBeVisible();
  });
});
