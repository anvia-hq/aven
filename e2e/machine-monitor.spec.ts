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
    // One row each, the online ones first and each group oldest first.
    await expect(rows).toHaveCount(4);
    expect(
      await rows.evaluateAll((items) => items.map((item) => item.getAttribute("aria-label"))),
    ).toEqual(["build-box", "hot-box", "old-box", "sleeping-box"]);
    // Above Settings, and compact: a reporting row has its meters under the name, the rest one line.
    const settings = await page.getByRole("button", { name: "Settings" }).boundingBox();
    const last = await rows.last().boundingBox();
    expect(last!.y + last!.height).toBeLessThanOrEqual(settings!.y);
    const heights = await Promise.all((await rows.all()).map((row) => row.boundingBox()));
    expect(heights.map((box) => box!.height <= 50)).toEqual([true, true, true, true]);
    expect(heights.slice(2).map((box) => box!.height <= 34)).toEqual([true, true]);

    // CPU, memory and disk of a runner that reports, each as a meter with its number.
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

    // Nearly full is drawn as a warning, and not before.
    const fillOf = (row: typeof build, name: string) =>
      row.getByRole("meter", { name }).locator("[data-slot=meter-fill]");
    await expect(
      fillOf(machines.getByRole("listitem", { name: "hot-box" }), "CPU of hot-box"),
    ).toHaveAttribute("data-high", "");
    await expect(fillOf(build, "CPU of build-box")).not.toHaveAttribute("data-high", "");

    // A runner that does not report, and one that is off, say so in the row.
    await expect(machines.getByRole("listitem", { name: "old-box" })).toContainText("Waiting");
    await expect(machines.getByRole("listitem", { name: "sleeping-box" })).toContainText("Offline");

    // The detail is on hover.
    await build.hover();
    const tip = page.locator('[data-slot="tooltip-content"]');
    await expect(tip).toContainText("Memory: 38%, 6.0 of 16.0 GB");
    await expect(tip).toContainText("Disk: 76%, 74.0 of 98.0 GB");
    await expect(tip).toContainText("4 cores");
    await expect(tip).toContainText("2 sandboxes running");

    // On every page of the shell, and a click goes to the runtimes.
    await page.goto("/bot");
    await expect(rows).toHaveCount(4);
    await build.click();
    await expect(page).toHaveURL(/\/settings\/runtimes$/);
  });
});
