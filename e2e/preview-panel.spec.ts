import { expect, test } from "@playwright/test";

import { registerUser, threadOnFakeRunner } from "./helpers";

test.describe("the Browser panel", () => {
  test("asks the person to confirm a port, and says previews are not set up on this server", async ({
    page,
  }) => {
    await registerUser(page, "prv", "Preview User");
    const { child, threadId } = await threadOnFakeRunner(page);

    try {
      await page.setViewportSize({ width: 1400, height: 900 });
      await page.goto(`/threads/${threadId}`);
      await page.getByRole("button", { name: "Browser", exact: true }).click();

      const panel = page.getByRole("region", { name: "Browser" });
      await expect(panel.getByLabel("Port")).toBeVisible();

      await panel.getByLabel("Port").fill("3000");
      await panel.getByRole("button", { name: "Open", exact: true }).click();

      const confirm = page.getByRole("alertdialog");
      await expect(confirm).toContainText(
        "Anyone allowed to use this runner can open what is on port 3000",
      );
      await expect(confirm).toHaveCSS("opacity", "1");

      await confirm.getByRole("button", { name: "Open", exact: true }).click();
      await expect(panel).toContainText("Previews are not set up on this server");
    } finally {
      child.kill();
    }
  });

  test("never opens a port the person did not confirm", async ({ page }) => {
    await registerUser(page, "prc", "Preview Cancel");
    const { child, threadId } = await threadOnFakeRunner(page);
    const asked: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/ports")) asked.push(request.url());
    });

    try {
      await page.goto(`/threads/${threadId}`);
      await page.getByRole("button", { name: "Browser", exact: true }).click();
      const panel = page.getByRole("region", { name: "Browser" });
      await panel.getByLabel("Port").fill("3000");
      await panel.getByRole("button", { name: "Open", exact: true }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Cancel" }).click();
      await expect(page.getByRole("alertdialog")).toHaveCount(0);
      expect(asked).toEqual([]);
    } finally {
      child.kill();
    }
  });
});
