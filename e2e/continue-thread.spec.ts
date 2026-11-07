import { spawn, type ChildProcess } from "node:child_process";

import { expect, test } from "@playwright/test";

import { registerUser, threadOnFakeRunner } from "./helpers";

const API_URL = "http://localhost:8100";

const children: ChildProcess[] = [];
test.afterEach(() => {
  for (const child of children.splice(0)) child.kill();
});

test.describe("continuing a thread on another runner (decision 0152)", () => {
  test("starts a thread on the other runner, shown as one quiet line, and leaves the old one", async ({
    page,
  }) => {
    await registerUser(page, "cnt", "Continue User");
    await page.request.post("/api/providers", {
      data: { kind: "openai", name: "Work", apiKey: "sk-test-1234" },
    });
    const { child, threadId } = await threadOnFakeRunner(page);
    children.push(child);
    const originalRuntimeId = (
      (await (await page.request.get(`/api/threads/${threadId}`)).json()) as { runtimeId: string }
    ).runtimeId;
    await page.setViewportSize({ width: 1400, height: 760 });
    await page.goto(`/threads/${threadId}`);

    const environment = page.getByRole("region", { name: "Environment" });
    await expect(environment).toContainText("fake desktop");
    await expect(
      environment.getByRole("button", { name: "Continue on another runner" }),
    ).toHaveCount(0);

    const created = await page.request.post("/api/runtimes", { data: { name: "big box" } });
    const { runtime, token } = (await created.json()) as { runtime: { id: string }; token: string };
    children.push(
      spawn("bun", ["e2e/fake-runner.ts"], {
        env: { ...process.env, AVEN_URL: API_URL, AVEN_RUNTIME_TOKEN: token },
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

    await page.reload();
    await environment.getByRole("button", { name: "Continue on another runner" }).click();
    const dialog = page.getByRole("dialog", { name: "Continue on another runner?" });
    await expect(dialog.getByRole("button", { name: "Continue", exact: true })).toBeDisabled();
    await dialog.getByRole("combobox", { name: "Runner" }).click();
    await page.getByRole("option", { name: "big box" }).click();
    await dialog.getByRole("button", { name: "Continue", exact: true }).click();

    await expect(page).not.toHaveURL(new RegExp(`/threads/${threadId}$`));
    await expect(page.getByText('Continued from "', { exact: false })).toBeVisible();
    await expect(page.getByRole("region", { name: "Environment" })).toContainText("big box");

    const old = (await (await page.request.get(`/api/threads/${threadId}`)).json()) as {
      runtimeId: string;
      state: string;
    };
    expect(old.runtimeId).toBe(originalRuntimeId);
    expect(old.runtimeId).not.toBe(runtime.id);
    expect(old.state).not.toBe("archived");
  });
});
