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

test.describe("machines", () => {
  test("an icon above Settings lists every registered machine with its load when it is hovered, as wide as the sidebar, and does nothing when clicked", async ({
    page,
  }) => {
    await registerUser(page, "rail", "Rail User");
    await runner(page, "build-box", { FAKE_STATS: stats({}) });
    await runner(page, "hot-box", { FAKE_STATS: stats({ cpuPercent: 96, sandboxes: 1 }) });
    await runner(page, "old-box");
    await page.request.post("/api/runtimes", { data: { name: "sleeping-box" } });

    await page.goto("/threads");
    const icon = page.getByRole("img", { name: "Machines", exact: true });
    await expect(icon).toBeVisible();
    await expect(page.getByRole("list", { name: "Registered machines" })).toHaveCount(0);

    await icon.hover();
    const list = page.getByRole("list", { name: "Registered machines" });
    const items = list.getByRole("listitem", { name: /-box$/ });
    await expect(items).toHaveCount(4);

    const build = list.getByRole("listitem", { name: "build-box" });
    await expect(build.getByRole("img", { name: "Online" })).toBeVisible();
    await expect(build.getByRole("meter", { name: "CPU of build-box" })).toHaveAttribute(
      "aria-valuenow",
      "58",
    );
    await expect(build.getByRole("meter", { name: "Memory of build-box" })).toHaveAttribute(
      "aria-valuenow",
      "38",
    );
    const disk = build.getByRole("meter", { name: "Disk of build-box" });
    await expect(disk).toHaveAttribute("aria-valuenow", "76");
    await expect(disk).toHaveAttribute("data-level", "busy");
    await expect(disk).toHaveAttribute("title", "Disk: 74.0 of 98.0 GB");
    await expect(build).toContainText("2 sandboxes running");

    const hot = list.getByRole("listitem", { name: "hot-box" });
    await expect(hot.getByRole("meter", { name: "CPU of hot-box" })).toHaveAttribute(
      "data-level",
      "high",
    );
    await expect(hot).toContainText("1 sandbox running");

    await expect(list.getByRole("listitem", { name: "old-box" })).toContainText("Waiting");
    const sleeping = list.getByRole("listitem", { name: "sleeping-box" });
    await expect(sleeping.getByRole("img", { name: "Offline" })).toBeVisible();
    await expect(sleeping).toContainText("Offline");

    const card = page.locator('[data-slot="hover-card-content"]');
    const sidebar = page.locator('[data-slot="sidebar-container"]');
    const cardWidth = (await card.boundingBox())!.width;
    const sidebarWidth = (await sidebar.boundingBox())!.width;
    expect(Math.abs(cardWidth - sidebarWidth)).toBeLessThanOrEqual(1);

    const url = page.url();
    await icon.click();
    expect(page.url()).toBe(url);
  });

  test("a runner behind the server has an Update button that asks it, and says Updating (decision 0146)", async ({
    page,
  }) => {
    await registerUser(page, "upd", "Update User");
    await runner(page, "old-box", { FAKE_BUILD: "9.9.0", FAKE_CAN_UPDATE: "1" });
    await runner(page, "current-box", { FAKE_BUILD: "9.9.9", FAKE_CAN_UPDATE: "1" });
    await runner(page, "dev-box", { FAKE_BUILD: "9.9.0" });

    await page.goto("/settings/runtimes");
    const runtimes = page.getByRole("list", { name: "Runtimes" });
    await expect(runtimes.getByRole("button", { name: "Update old-box" })).toBeVisible();
    await expect(runtimes.getByRole("button", { name: "Update current-box" })).toHaveCount(0);
    await expect(runtimes.getByRole("button", { name: "Update dev-box" })).toHaveCount(0);

    await runtimes.getByRole("button", { name: "Update old-box" }).click();
    const dialog = page.getByRole("dialog", { name: "Update old-box?" });
    await expect(dialog).toContainText("restarts for a moment");
    await dialog.getByRole("button", { name: "Update", exact: true }).click();
    await expect(runtimes.getByRole("listitem", { name: "old-box" })).toContainText("Updating…");
    await expect(runtimes.getByRole("button", { name: "Update old-box" })).toHaveCount(0);

    await page.reload();
    await expect(runtimes.getByRole("listitem", { name: "old-box" })).toContainText("Updating…");
  });

  test("a runner that is busy says so and keeps its button", async ({ page }) => {
    await registerUser(page, "bsy", "Busy User");
    await runner(page, "busy-box", {
      FAKE_BUILD: "9.9.0",
      FAKE_CAN_UPDATE: "1",
      FAKE_UPDATE_BUSY: "A run is going on this runner. Try again when it has finished.",
    });

    await page.goto("/settings/runtimes");
    const runtimes = page.getByRole("list", { name: "Runtimes" });
    await runtimes.getByRole("button", { name: "Update busy-box" }).click();
    await page
      .getByRole("dialog", { name: "Update busy-box?" })
      .getByRole("button", { name: "Update", exact: true })
      .click();
    await expect(page.getByText("A run is going on this runner")).toBeVisible();
    await page
      .getByRole("dialog", { name: "Update busy-box?" })
      .getByRole("button", { name: "Cancel" })
      .click();
    await expect(runtimes.getByRole("button", { name: "Update busy-box" })).toBeVisible();
  });
});
