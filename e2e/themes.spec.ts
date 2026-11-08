import { expect, test } from "@playwright/test";

import { registerUser } from "./helpers";

const palettes = ["Mint", "Catppuccin", "Tokyo Night", "GitHub", "One Dark", "Solarized"];
const ids: Record<string, string> = {
  Catppuccin: "catppuccin",
  "Tokyo Night": "tokyo-night",
  GitHub: "github",
  "One Dark": "one-dark",
  Solarized: "solarized",
};

test.describe("themes", () => {
  test("every theme can be picked, in light and dark, and is remembered", async ({ page }) => {
    await registerUser(page, "theme", "Theme User");
    await page.goto("/settings/general");
    const html = page.locator("html");

    const picker = page.getByRole("combobox", { name: "Theme" });
    for (const name of palettes) {
      await picker.click();
      await page.getByRole("option", { name, exact: true }).click();
      await expect(picker).toContainText(name);
      if (name === "Mint") await expect(html).not.toHaveAttribute("data-theme", /.+/);
      else await expect(html).toHaveAttribute("data-theme", ids[name]);
    }

    await picker.click();
    await page.getByRole("option", { name: "Catppuccin", exact: true }).click();
    await page.reload();
    await expect(html).toHaveAttribute("data-theme", "catppuccin");
    await expect(page.getByRole("combobox", { name: "Theme" })).toContainText("Catppuccin");

    await page.getByRole("switch", { name: "Dark mode" }).click();
    await expect(html).not.toHaveClass(/dark/);
    await expect(html).toHaveAttribute("data-theme", "catppuccin");

    await page.getByRole("switch", { name: "Dark mode" }).click();
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

  test("screenshots of every theme", async ({ page }) => {
    test.skip(!process.env.THEME_SHOTS, "only when recording proof");
    await page.setViewportSize({ width: 1280, height: 900 });
    await registerUser(page, "shots", "Theme User");
    await page.goto("/settings/general");
    const dark = page.getByRole("switch", { name: "Dark mode" });
    for (const mode of ["light", "dark"] as const) {
      if ((await dark.getAttribute("aria-checked")) === String(mode === "light"))
        await dark.click();
      for (const name of palettes) {
        await page.getByRole("combobox", { name: "Theme" }).click();
        await page.getByRole("option", { name, exact: true }).click();
        await page.keyboard.press("Escape");
        await page.screenshot({
          path: `.aven/proof/themes/${ids[name] ?? "mint"}-${mode}.png`,
        });
      }
    }
  });
});
