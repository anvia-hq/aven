import { spawn, type ChildProcess } from "node:child_process";

import { expect, test, type Page } from "@playwright/test";

import { fakeRunnerProcessEnv } from "./fake-runner-config";
import { registerUser } from "./helpers";

const API_URL = "http://localhost:8100";

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

test.describe("machines", () => {
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
