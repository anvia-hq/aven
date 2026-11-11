import { spawn, type ChildProcess } from "node:child_process";

import { expect, test } from "@playwright/test";

import { registerUser } from "./helpers";

test.describe("runtimes", () => {
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

    await page.goto("/settings/runtimes");
    await page.getByRole("button", { name: "Revoke e2e-laptop" }).click();
    await expect(page.getByText("Runtime revoked")).toBeVisible();
    await expect(page.getByText("No runtimes yet.")).toBeVisible();
  });
});

test.describe("the built-in runtime", () => {
  test("is listed with an icon and does not break the page", async ({ page }) => {
    await registerUser(page, "rtbuiltin", "Built In Viewer");
    await page.route("**/api/runtimes", (route) =>
      route.request().method() === "GET"
        ? route.fulfill({
            json: [
              {
                id: "00000000-0000-4000-8000-000000000001",
                name: "Control plane",
                ownerId: null,
                tokenHint: "",
                online: true,
                build: null,
                outdated: false,
                updateTo: null,
                isControlPlane: true,
                canUpdate: false,
                stats: null,
                lastSeenAt: null,
                createdAt: new Date().toISOString(),
              },
            ],
          })
        : route.continue(),
    );
    await page.goto("/settings/runtimes");
    const table = page.getByRole("table", { name: "Runtimes" });
    await expect(table.getByRole("row", { name: /Control plane/ })).toBeVisible();
    await expect(table.getByRole("img", { name: "Built in" })).toBeVisible();
    await expect(page.getByText("Something went wrong")).toHaveCount(0);
  });
});

test.describe("renaming a runtime", () => {
  test("changes its label in the list and on the server, and a blank name cannot be saved", async ({
    page,
  }) => {
    await registerUser(page, "rtname", "Runtime Namer");
    const created = await page.request.post("/api/runtimes", { data: { name: "devscalelabs-1" } });
    expect(created.ok()).toBe(true);
    await page.goto("/settings/runtimes");

    const table = page.getByRole("table", { name: "Runtimes" });
    await expect(table.getByRole("row", { name: /devscalelabs-1/ })).toBeVisible();
    await expect(table).not.toContainText("Built in");

    await page.getByRole("button", { name: "Rename devscalelabs-1" }).click();
    const dialog = page.getByRole("dialog", { name: "Rename runtime" });
    const save = dialog.getByRole("button", { name: "Save" });
    await expect(save).toBeDisabled();
    await dialog.getByLabel("Runtime name").fill("   ");
    await expect(save).toBeDisabled();
    await dialog.getByLabel("Runtime name").fill("Homelab VPS");
    await save.click();

    await expect(dialog).toHaveCount(0);
    await expect(table.getByRole("row", { name: /Homelab VPS/ })).toBeVisible();
    await expect(table).not.toContainText("devscalelabs-1");
    const listed = (await (await page.request.get("/api/runtimes")).json()) as { name: string }[];
    expect(listed.map((runtime) => runtime.name)).toEqual(["Homelab VPS"]);
  });
});
