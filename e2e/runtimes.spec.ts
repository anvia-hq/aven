import { spawn, type ChildProcess } from "node:child_process";

import { expect, test, type Page } from "@playwright/test";

const unique = () => `rt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@aven.test`;

async function register(page: Page) {
  await page.goto("/register");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Name").fill("Runtime User");
  await page.getByLabel("Email").fill(unique());
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/threads$/);
}

test.describe("runtimes", () => {
  let runtime: ChildProcess | undefined;
  test.afterEach(() => {
    runtime?.kill();
    runtime = undefined;
  });

  test("add a runtime, start it with the shown command, see it online, revoke it", async ({
    page,
  }) => {
    await register(page);
    await page.goto("/settings/runtimes");
    await expect(page.getByText("No runtimes yet.")).toBeVisible();

    await page.getByRole("button", { name: "Add runtime" }).click();
    await page.getByLabel("Name").fill("e2e-laptop");
    await page.getByRole("button", { name: "Add runtime" }).last().click();

    const command = await page.getByLabel("Runtime command").innerText();
    expect(command).toMatch(/AVEN_RUNTIME_TOKEN=avrt_/);
    const url = /AVEN_URL=(\S+)/.exec(command)?.[1];
    const token = /AVEN_RUNTIME_TOKEN=(\S+)/.exec(command)?.[1];
    await page.getByRole("button", { name: "Done" }).click();

    const row = page.getByRole("table", { name: "Runtimes" }).getByRole("row", {
      name: /e2e-laptop/,
    });
    await expect(row).toContainText("Offline");

    // The command as shown, through the platform's /api proxy, WebSocket included.
    runtime = spawn("bun", ["apps/runtime/src/main.ts"], {
      env: { ...process.env, AVEN_URL: url, AVEN_RUNTIME_TOKEN: token },
      stdio: "ignore",
    });
    await expect(async () => {
      await page.reload();
      await expect(row).toContainText("Online", { timeout: 1000 });
    }).toPass({ timeout: 15_000 });

    // Rotating cuts it off; the old process is refused and exits, and the new token reconnects.
    const refused = new Promise<number | null>((resolve) => runtime?.once("exit", resolve));
    await page.getByRole("button", { name: "Rotate token for e2e-laptop" }).click();
    await page.getByRole("button", { name: "Rotate token", exact: true }).click();
    const rotatedCommand = await page.getByLabel("Runtime command").innerText();
    const rotatedToken = /AVEN_RUNTIME_TOKEN=(\S+)/.exec(rotatedCommand)?.[1];
    expect(rotatedToken).not.toBe(token);
    expect(await refused).toBe(1);
    await page.getByRole("button", { name: "Done" }).click();
    runtime = spawn("bun", ["apps/runtime/src/main.ts"], {
      env: { ...process.env, AVEN_URL: url, AVEN_RUNTIME_TOKEN: rotatedToken },
      stdio: "ignore",
    });
    await expect(async () => {
      await page.reload();
      await expect(row).toContainText("Online", { timeout: 1000 });
    }).toPass({ timeout: 15_000 });

    // Projects can now be put on it.
    await page.goto("/threads");
    await page.getByRole("button", { name: "New project" }).click();
    await expect(page.getByRole("combobox", { name: "Machine" })).toBeVisible();
    await page.keyboard.press("Escape");

    await page.goto("/settings/runtimes");
    await page.getByRole("button", { name: "Revoke e2e-laptop" }).click();
    await expect(page.getByText("Runtime revoked")).toBeVisible();
    await expect(page.getByText("No runtimes yet.")).toBeVisible();
  });
});
