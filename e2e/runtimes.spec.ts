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
      .getByRole("list", { name: "Runtimes" })
      .getByRole("listitem")
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
                githubMode: "machine",
                github: null,
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
    const table = page.getByRole("list", { name: "Runtimes" });
    await expect(table.getByRole("listitem", { name: /Control plane/ })).toBeVisible();
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

    const table = page.getByRole("list", { name: "Runtimes" });
    await expect(table.getByRole("listitem", { name: /devscalelabs-1/ })).toBeVisible();
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
    await expect(table.getByRole("listitem", { name: /Homelab VPS/ })).toBeVisible();
    await expect(table).not.toContainText("devscalelabs-1");
    const listed = (await (await page.request.get("/api/runtimes")).json()) as { name: string }[];
    expect(listed.map((runtime) => runtime.name)).toEqual(["Homelab VPS"]);
  });
  test("says which GitHub a runner's runs use, and its owner can change it", async ({ page }) => {
    await registerUser(page, "rtgithub", "Runtime Github");
    const created = await page.request.post("/api/runtimes", { data: { name: "big-box" } });
    expect(created.ok()).toBe(true);
    await page.goto("/settings/runtimes");

    const row = page
      .getByRole("list", { name: "Runtimes" })
      .getByRole("listitem", { name: /big-box/ });
    await expect(row).toContainText("GitHub: this machine");

    await page.getByRole("button", { name: "GitHub of big-box" }).click();
    const dialog = page.getByRole("dialog", { name: "GitHub on big-box" });
    await expect(dialog).toContainText("whoever sent the message");
    await dialog.getByRole("combobox", { name: "Runs use" }).click();
    await page.getByRole("option", { name: "Each person's own account" }).click();
    await expect(dialog).toContainText("the machine's own login is not used");
    await dialog.getByRole("button", { name: "Save" }).click();

    await expect(dialog).toHaveCount(0);
    await expect(row).toContainText("GitHub: each person");
    const listed = (await (await page.request.get("/api/runtimes")).json()) as {
      githubMode: string;
    }[];
    expect(listed.map((runtime) => runtime.githubMode)).toEqual(["person"]);
  });
});

test.describe("a boat.dev runtime", () => {
  test("asks for an API key and does not show a runner command", async ({ page }) => {
    await registerUser(page, "rtboat", "Boat User");
    await page.goto("/settings/runtimes");
    await page.getByRole("button", { name: "Add runtime" }).click();
    const dialog = page.getByRole("dialog", { name: "Add runtime" });
    await dialog.getByRole("combobox", { name: "Kind" }).click();
    await page.getByRole("option", { name: "boat.dev sandbox" }).click();
    await expect(dialog.getByLabel("boat.dev API key")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Add runtime" })).toBeDisabled();
    await dialog.getByLabel("Name").fill("cloud");
    await dialog.getByLabel("boat.dev API key").fill("boat_e2e_key");
    await dialog.getByRole("combobox", { name: "Size" }).click();
    await page.getByRole("option", { name: "Small · 2 vCPU, 4 GB" }).click();
    await expect(dialog).toContainText("AVEN_BOAT_RUNNER_URL");

    const posted = page.waitForRequest(
      (request) => request.method() === "POST" && request.url().endsWith("/api/runtimes"),
    );
    await page.route("**/api/runtimes", (route) => {
      if (route.request().method() !== "POST") return route.continue();

      return route.fulfill({
        json: {
          token: "avrt_should_not_be_shown",
          runtime: { name: "cloud", provider: "boat" },
        },
      });
    });
    await dialog.getByRole("button", { name: "Add runtime" }).click();
    const request = await posted;
    expect(request.postDataJSON()).toEqual({
      name: "cloud",
      provider: "boat",
      apiKey: "boat_e2e_key",
      machineType: "small",
    });
    await expect(page.getByRole("dialog", { name: "cloud is saved" })).toBeVisible();
    await expect(page.getByLabel("Runtime command")).toHaveCount(0);
    await expect(page.getByText("avrt_should_not_be_shown")).toHaveCount(0);

    await page.route("**/api/runtimes", (route) => {
      if (route.request().method() !== "GET") return route.continue();

      return route.fulfill({
        json: [
          {
            id: "00000000-0000-4000-8000-000000000099",
            name: "cloud",
            ownerId: "someone",
            host: false,
            shared: false,
            githubMode: "person",
            github: null,
            provider: "boat",
            boatMachineType: "small",
            boatSandboxId: null,
            boatKeyHint: "2key",
            directories: [],
            tokenHint: "oken",
            online: false,
            build: null,
            outdated: false,
            updateTo: null,
            isControlPlane: false,
            canUpdate: false,
            stats: null,
            lastSeenAt: null,
            createdAt: new Date().toISOString(),
          },
        ],
      });
    });
    await page.reload();
    const row = page.getByRole("listitem", { name: "cloud" });
    await expect(row.getByText("boat.dev")).toBeVisible();
    await expect(row).toContainText("Asleep until a thread needs it.");
  });
});
