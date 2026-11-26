import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { DEFAULT_PALETTE, PALETTES } from "../apps/platform/src/modules/theme/catalog";
import { registerUser, threadOnFakeRunner } from "./helpers";
const shotsDir = join(process.cwd(), "e2e", "theme-gallery", "shots");

async function chooseMode(page: Page, name: "Light" | "Dark") {
  await page.getByRole("combobox", { name: "Mode" }).click();
  await page.getByRole("option", { name, exact: true }).click();
}

async function expectPalette(page: Page, id: string, dark: boolean) {
  const html = page.locator("html");

  if (id === DEFAULT_PALETTE) await expect(html).not.toHaveAttribute("data-theme", /.+/);
  else await expect(html).toHaveAttribute("data-theme", id);

  if (dark) await expect(html).toHaveClass(/dark/);
  else await expect(html).not.toHaveClass(/dark/);
}

test.use({ viewport: { width: 1440, height: 900 } });

test("capture every palette in light and dark", async ({ page }) => {
  test.setTimeout(600_000);
  mkdirSync(shotsDir, { recursive: true });
  await registerUser(page, "gallery", "Gallery User");
  const { child, threadId } = await threadOnFakeRunner(page);
  try {
    await page.route("**/api/threads/*/events", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: `retry: 600000\n\ndata: ${JSON.stringify({
          type: "snapshot",
          running: false,
          hidden: 0,
          messages: [
            {
              id: "g-0",
              role: "user",
              parts: [{ type: "text", text: "How do I add caching to this endpoint?" }],
            },
            {
              id: "g-1",
              role: "assistant",
              parts: [
                {
                  type: "text",
                  text: "Wrap the handler with a short-lived cache keyed on the request path. Keep the TTL under a minute while you measure hit rates, then tune from there.",
                },
              ],
            },
          ],
        })}\n\n`,
      }),
    );
    const threadUrl = `/threads/${threadId}`;

    for (const { id, label } of PALETTES) {
      await page.goto("/settings/general");
      const card = page.getByRole("button", { name: label, exact: true });
      await card.click();
      await expect(card).toHaveAttribute("aria-pressed", "true");

      await chooseMode(page, "Light");
      await expectPalette(page, id, false);
      await page.goto(threadUrl);
      await expect(page.getByText("Wrap the handler with a short-lived cache")).toBeVisible();
      await page.screenshot({ path: join(shotsDir, `${id}-light.png`), animations: "disabled" });

      await page.goto("/settings/general");
      await chooseMode(page, "Dark");
      await expectPalette(page, id, true);
      await page.goto(threadUrl);
      await expect(page.getByText("Wrap the handler with a short-lived cache")).toBeVisible();
      await page.screenshot({ path: join(shotsDir, `${id}-dark.png`), animations: "disabled" });
    }
  } finally {
    child.kill();
  }
});
