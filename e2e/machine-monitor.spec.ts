import { spawn, type ChildProcess } from "node:child_process";

import { expect, test, type Page } from "@playwright/test";

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
    await expect(build.getByRole("meter", { name: "CPU of build-box" })).toHaveAttribute(
      "aria-valuenow",
      "58",
    );
    await expect(build.getByRole("meter", { name: "Memory of build-box" })).toHaveAttribute(
      "aria-valuenow",
      "38",
    );
    await expect(build.getByRole("meter", { name: "Disk of build-box" })).toHaveAttribute(
      "aria-valuenow",
      "76",
    );
    await expect(build).toContainText("CPU58%");
    await expect(build).toContainText("MEM38%");
    await expect(build).toContainText("DSK76%");
    await expect(
      build.getByRole("meter", { name: "CPU of build-box" }).locator("[data-slot=meter-fill]"),
    ).toHaveCSS("width", /^\d/);

    const fillOf = (row: typeof build, name: string) =>
      row.getByRole("meter", { name }).locator("[data-slot=meter-fill]");
    await expect(
      fillOf(machines.getByRole("listitem", { name: "hot-box" }), "CPU of hot-box"),
    ).toHaveAttribute("data-level", "high");
    await expect(fillOf(build, "CPU of build-box")).toHaveAttribute("data-level", "low");

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
