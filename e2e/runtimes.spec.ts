import { spawn, spawnSync, type ChildProcess } from "node:child_process";

import { expect, test } from "@playwright/test";

import { connectGithub, registerUser } from "./helpers";

const hasSandboxImage =
  spawnSync("docker", ["image", "inspect", "aven-sandbox-desktop:dev"]).status === 0;

test.describe("runtimes", () => {
  test.skip(!hasSandboxImage, "needs Docker and the aven-sandbox-desktop:dev image");

  let runtime: ChildProcess | undefined;
  test.afterEach(() => {
    runtime?.kill();
    runtime = undefined;
  });

  test("add a runtime, start it with the shown command, see it online, revoke it", async ({
    page,
  }) => {
    await registerUser(page, "rt", "Runtime User");
    await page.goto("/settings/runtimes");
    await expect(page.getByText("No runtimes yet.")).toBeVisible();

    await page.getByRole("button", { name: "Add runtime" }).click();
    await page.getByLabel("Name").fill("e2e-laptop");
    await page.getByRole("button", { name: "Add runtime" }).last().click();

    const command = await page.getByLabel("Runtime command").innerText();
    expect(command).toMatch(/install\.sh \| bash -s -- --runner --url \S+ --token avrt_/);
    const url = /--url (\S+)/.exec(command)?.[1];
    const token = /--token (\S+)/.exec(command)?.[1];
    await page.getByRole("button", { name: "Done" }).click();

    const row = page
      .getByRole("table", { name: "Runtimes" })
      .getByRole("row")
      .filter({ hasText: "e2e-laptop" });
    await expect(row).toContainText("Offline");
    await expect(row).not.toContainText("token");

    runtime = spawn("bun", ["apps/runtime/src/main.ts"], {
      env: { ...process.env, AVEN_URL: url, AVEN_RUNTIME_TOKEN: token },
      stdio: "ignore",
    });
    await expect(async () => {
      await page.reload();
      await expect(row).toContainText("Online", { timeout: 1000 });
    }).toPass({ timeout: 15_000 });

    const refused = new Promise<number | null>((resolve) => runtime?.once("exit", resolve));
    await page.getByRole("button", { name: "Rotate token for e2e-laptop" }).click();
    await page.getByRole("button", { name: "Rotate token", exact: true }).click();
    const rotatedCommand = await page.getByLabel("Runtime command").innerText();
    const rotatedToken = /--token (\S+)/.exec(rotatedCommand)?.[1];
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

    await connectGithub(page);
    await page.goto("/threads");
    await page.getByRole("button", { name: "Import repository" }).click();
    await expect(page.getByRole("combobox", { name: "Runner" })).toBeVisible();
    await page.keyboard.press("Escape");

    await page.goto("/settings/runtimes");
    await page.getByRole("button", { name: "Revoke e2e-laptop" }).click();
    await expect(page.getByText("Runtime revoked")).toBeVisible();
    await expect(page.getByText("No runtimes yet.")).toBeVisible();
  });
});
