import { expect, test, type Page } from "@playwright/test";

import { registerUser, threadOnFakeRunner } from "./helpers";

const palettes = [
  "Mint",
  "Catppuccin",
  "Tokyo Night",
  "GitHub",
  "One Dark",
  "Solarized",
  "Nord",
  "Dracula",
  "Gruvbox",
  "Rosé Pine",
  "Monokai",
  "Ayu",
  "Material",
  "Everforest",
  "Night Owl",
  "Palenight",
  "Kanagawa",
  "Oceanic",
  "Horizon",
  "Zenburn",
  "Synthwave",
  "Codex",
  "Claude",
  "Devin",
  "T3",
];
const ids: Record<string, string> = {
  Catppuccin: "catppuccin",
  "Tokyo Night": "tokyo-night",
  GitHub: "github",
  "One Dark": "one-dark",
  Solarized: "solarized",
  Nord: "nord",
  Dracula: "dracula",
  Gruvbox: "gruvbox",
  "Rosé Pine": "rose-pine",
  Monokai: "monokai",
  Ayu: "ayu",
  Material: "material",
  Everforest: "everforest",
  "Night Owl": "night-owl",
  Palenight: "palenight",
  Kanagawa: "kanagawa",
  Oceanic: "oceanic",
  Horizon: "horizon",
  Zenburn: "zenburn",
  Synthwave: "synthwave",
  Codex: "codex",
  Claude: "claude",
  Devin: "devin",
  T3: "t3",
};

async function chooseMode(page: Page, name: "Light" | "Dark" | "System") {
  await page.getByRole("combobox", { name: "Mode" }).click();
  await page.getByRole("option", { name, exact: true }).click();
}

async function choosePalette(page: Page, palette: string, mode: "light" | "dark") {
  await page.evaluate(
    ({ palette, mode }) => {
      for (const [key, value] of [
        ["palette", palette],
        ["theme", mode],
      ] as const) {
        const stored = JSON.stringify(value);
        localStorage.setItem(key, stored);
        window.dispatchEvent(
          new StorageEvent("storage", { key, newValue: stored, storageArea: localStorage }),
        );
      }
    },
    { palette, mode },
  );
  const html = page.locator("html");
  await expect(html).toHaveAttribute("data-theme", palette);

  if (mode === "dark") {
    await expect(html).toHaveClass(/dark/);
  } else {
    await expect(html).not.toHaveClass(/dark/);
  }

  await page.waitForTimeout(600);
}

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
    await registerUser(page, "mode", "Mode User");
    await page.goto("/settings/general");
    const html = page.locator("html");
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

  test("screenshots of every theme", async ({ page }) => {
    test.skip(!process.env.THEME_SHOTS, "only when recording proof");
    await page.setViewportSize({ width: 1280, height: 900 });
    await registerUser(page, "shots", "Theme User");
    await page.goto("/settings/general");
    for (const mode of ["light", "dark"] as const) {
      await chooseMode(page, mode === "light" ? "Light" : "Dark");
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

  test("screenshots of the new themes on a thread", async ({ page }) => {
    test.skip(!process.env.THEME_SHOTS, "only when recording proof");
    await page.setViewportSize({ width: 1280, height: 900 });
    await registerUser(page, "shotthread", "Theme User");
    await page.request.post("/api/providers", {
      data: { kind: "anthropic", name: "Anthropic", apiKey: "sk-ant-test" },
    });
    const { child, threadId } = await threadOnFakeRunner(page, { FAKE_SUBAGENTS: "1" });

    try {
      await page.goto(`/threads/${threadId}`);
      await page
        .getByRole("textbox", { name: "Prompt" })
        .fill("Where does the auth middleware live, and can you add a test for it?");
      await page.getByRole("button", { name: "Send" }).click();
      await expect(
        page.getByText("Auth is in src/auth.ts; the test could not be written."),
      ).toBeVisible({ timeout: 30_000 });
      await page.locator('[data-role="worked"]').first().click();

      for (const mode of ["light", "dark"] as const) {
        for (const name of ["Codex", "Claude", "Devin", "T3"]) {
          await choosePalette(page, ids[name]!, mode);
          await page.screenshot({
            path: `.aven/proof/themes/${ids[name]}-${mode}-thread.png`,
          });
        }
      }
    } finally {
      child.kill();
    }
  });
});
