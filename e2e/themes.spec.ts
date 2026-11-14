import { expect, test, type Page } from "@playwright/test";

import { DEFAULT_PALETTE, PALETTES } from "../apps/platform/src/modules/theme/types";
import { registerUser } from "./helpers";

async function chooseMode(page: Page, name: "Light" | "Dark" | "System") {
  await page.getByRole("combobox", { name: "Mode" }).click();
  await page.getByRole("option", { name, exact: true }).click();
}

test.describe("themes", () => {
  test("every theme can be picked, in light and dark, and is remembered", async ({ page }) => {
    await registerUser(page, "theme", "Theme User");
    await page.goto("/settings/general");
    const html = page.locator("html");

    const picker = page.getByRole("combobox", { name: "Theme" });
    for (const { id, label } of PALETTES) {
      await picker.click();
      await page.getByRole("option", { name: label, exact: true }).click();
      await expect(picker).toContainText(label);

      if (id === DEFAULT_PALETTE) await expect(html).not.toHaveAttribute("data-theme", /.+/);
      else await expect(html).toHaveAttribute("data-theme", id);
    }

    await picker.click();
    await page.getByRole("option", { name: "Catppuccin", exact: true }).click();
    await page.reload();
    await expect(html).toHaveAttribute("data-theme", "catppuccin");
    await expect(page.getByRole("combobox", { name: "Theme" })).toContainText("Catppuccin");

    await chooseMode(page, "Light");
    await expect(html).not.toHaveClass(/dark/);
    await expect(html).toHaveAttribute("data-theme", "catppuccin");

    await chooseMode(page, "Dark");
    await expect(html).toHaveClass(/dark/);
    const border = await html.evaluate((el) =>
      getComputedStyle(el).getPropertyValue("--border").trim(),
    );
    expect(border).toBe("#313244");

    const brand = await html.evaluate((el) =>
      getComputedStyle(el).getPropertyValue("--brand").trim(),
    );
    await page.getByRole("combobox", { name: "Theme" }).click();
    await page.getByRole("option", { name: "GitHub", exact: true }).click();
    await expect(html).toHaveAttribute("data-theme", "github");
    expect(
      await html.evaluate((el) => getComputedStyle(el).getPropertyValue("--brand").trim()),
    ).toBe(brand);
  });

  test("a palette can lend the headings a face of its own", async ({ page }) => {
    await registerUser(page, "heading", "Heading User");
    await page.goto("/settings/general");
    const html = page.locator("html");
    const heading = page.getByRole("heading", { level: 1 }).first();
    const picker = page.getByRole("combobox", { name: "Theme" });

    await picker.click();
    await page.getByRole("option", { name: "Claude", exact: true }).click();
    await expect(html).toHaveAttribute("style", /--palette-heading-font/);
    await expect(heading).toHaveCSS("font-family", /Source Serif 4/);
    await expect(page.locator("#aven-theme-font")).toHaveAttribute(
      "href",
      /family=Source\+Serif\+4/,
    );

    await picker.click();
    await page.getByRole("option", { name: "Mint", exact: true }).click();
    await expect(html).not.toHaveAttribute("style", /--palette-heading-font/);
    await expect(page.locator("#aven-theme-font")).toHaveCount(0);

    await picker.click();
    await page.getByRole("option", { name: "Codex", exact: true }).click();
    await expect(html).not.toHaveAttribute("style", /--palette-heading-font/);
  });

  test("the mode is light, dark or the device's, and system follows the device as it changes", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "light" });
    const html = page.locator("html");
    await page.goto("/register");
    await expect(html).toHaveClass(/dark/);
    await registerUser(page, "mode", "Mode User");
    await page.goto("/settings/general");
    const mode = page.getByRole("combobox", { name: "Mode" });

    await expect(mode).toContainText("Dark");
    await expect(html).toHaveClass(/dark/);
    await mode.click();
    await expect(page.getByRole("option")).toHaveText(["Light", "Dark", "System"]);
    await page.getByRole("option", { name: "System", exact: true }).click();
    await expect(mode).toContainText("System");
    await expect(html).not.toHaveClass(/dark/);

    await page.emulateMedia({ colorScheme: "dark" });
    await expect(html).toHaveClass(/dark/);
    await page.emulateMedia({ colorScheme: "light" });
    await expect(html).not.toHaveClass(/dark/);

    await page.reload();
    await expect(page.getByRole("combobox", { name: "Mode" })).toContainText("System");
    await expect(html).not.toHaveClass(/dark/);
    await page.emulateMedia({ colorScheme: "dark" });
    await page.reload();
    await expect(html).toHaveClass(/dark/);

    await chooseMode(page, "Light");
    await expect(html).not.toHaveClass(/dark/);
    await page.reload();
    await expect(page.getByRole("combobox", { name: "Mode" })).toContainText("Light");
    await expect(html).not.toHaveClass(/dark/);
  });

  test("the sidebar has no theme toggle, on the rail or in the drawer", async ({ page }) => {
    await registerUser(page, "notoggle", "No Toggle User");
    await page.goto("/threads");
    await expect(page.getByRole("button", { name: "Toggle theme" })).toHaveCount(0);
    await expect(
      page.locator("[data-slot=sidebar]").getByRole("button", { name: "Settings" }),
    ).toBeHidden();
    await page
      .getByRole("navigation", { name: "Aven" })
      .getByRole("link", { name: "Settings" })
      .click();
    await expect(page).toHaveURL(/\/settings\/general/);
    await page.setViewportSize({ width: 390, height: 800 });
    await expect(page.getByRole("button", { name: "Toggle theme" })).toHaveCount(0);
  });

  test("the interface font can be chosen and is remembered", async ({ page }) => {
    await registerUser(page, "font", "Font User");
    await page.goto("/settings/general");
    const picker = page.getByRole("combobox", { name: "Interface font" });
    await picker.click();
    await page.getByRole("option", { name: "Inter", exact: true }).click();
    await expect(picker).toContainText("Inter");
    await expect(page.locator("html")).toHaveAttribute("style", /--app-font/);
    await expect(page.locator("#aven-font")).toHaveAttribute("href", /family=Inter/);
    await page.reload();
    await expect(page.getByRole("combobox", { name: "Interface font" })).toContainText("Inter");
  });

  test("the text size of the interface and of the bot chat can be chosen and is remembered", async ({
    page,
  }) => {
    await registerUser(page, "textsize", "Text Size User");
    await page.goto("/settings/general");
    for (const name of ["Interface text size", "Thread text size", "Bot chat text size"]) {
      await expect(page.getByRole("combobox", { name })).toContainText("Default");
    }
    await page.goto("/bot");
    const hello = page.getByText(/Say hello to/);
    await expect(hello).toBeVisible();
    const before = (await hello.boundingBox())!.height;

    await page.goto("/settings/general");
    await page.getByRole("combobox", { name: "Bot chat text size" }).click();
    await page.getByRole("option", { name: "Extra large", exact: true }).click();
    await page.goto("/bot");
    await expect(hello).toBeVisible();
    const larger = (await hello.boundingBox())!.height;
    expect(larger).toBeGreaterThan(before * 1.2);

    await page.goto("/settings/general");
    await page.getByRole("combobox", { name: "Interface text size" }).click();
    await page.getByRole("option", { name: "Large", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("style", /font-size: 112\.5%/);
    await page.reload();
    await expect(page.getByRole("combobox", { name: "Interface text size" })).toContainText(
      "Large",
    );
    await expect(page.getByRole("combobox", { name: "Thread text size" })).toContainText("Default");
  });
});
