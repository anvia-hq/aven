import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { PALETTES } from "../../apps/platform/src/modules/theme/catalog";
import type { GalleryPalette } from "./types";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");
const shotsDir = join(repoRoot, "e2e", "theme-gallery", "shots");
const outPath = join(shotsDir, "themes.html");
const cssPath = join(repoRoot, "apps", "platform", "src", "index.css");

const galleryPalettes: GalleryPalette[] = PALETTES.flatMap((option) => [
  {
    id: option.id,
    label: option.label,
    light: option.light,
    dark: option.dark,
    headingFamily: option.heading?.family ?? null,
  },
]);

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replaceAll("'", "&#39;");
}

function cardHtml(palette: GalleryPalette): string {
  const id = escapeAttr(palette.id);
  const label = escapeHtml(palette.label);
  const lightAlt = escapeAttr(`${palette.label} in light mode`);
  const darkAlt = escapeAttr(`${palette.label} in dark mode`);
  const heading = palette.headingFamily
    ? `<p class="heading-note">Heading: <code>${escapeHtml(palette.headingFamily)}</code></p>`
    : "";
  return [
    `<article class="card" data-palette="${id}">`,
    `<h2>${label}</h2>`,
    heading,
    `<div class="shots">`,
    `<figure><img src="${id}-light.png" alt="${lightAlt}" loading="lazy"><figcaption>Light</figcaption></figure>`,
    `<figure><img src="${id}-dark.png" alt="${darkAlt}" loading="lazy"><figcaption>Dark</figcaption></figure>`,
    `</div>`,
    `<table class="tokens">`,
    `<caption>Token values and contrast verdicts</caption>`,
    `<thead><tr><th scope="col">Token</th><th scope="col">Light</th><th scope="col">Dark</th></tr></thead>`,
    `<tbody data-token-rows="${id}"></tbody>`,
    `</table>`,
    `<ul class="verdicts" data-verdicts="${id}"></ul>`,
    `</article>`,
  ].join("\n");
}

function readThemeCss(): string {
  return readFileSync(cssPath, "utf8");
}

function pageScript(): string {
  return [
    "const TOKENS = [",
    '  "--background",',
    '  "--foreground",',
    '  "--muted-foreground",',
    '  "--primary",',
    '  "--primary-foreground",',
    "];",
    "const PAIRS = [",
    '  { key: "fg", a: "--foreground", b: "--background", label: "Text on background" },',
    '  { key: "muted", a: "--muted-foreground", b: "--background", label: "Muted text on background" },',
    '  { key: "primary", a: "--primary-foreground", b: "--primary", label: "Text on primary" },',
    "];",
    "function channel(value) {",
    "  const v = value / 255;",
    "  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);",
    "}",
    "function luminance(r, g, b) {",
    "  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);",
    "}",
    "function ratioOf(a, b) {",
    "  const high = Math.max(a, b);",
    "  const low = Math.min(a, b);",
    "  return (high + 0.05) / (low + 0.05);",
    "}",
    "const swatch = document.createElement(\"canvas\");",
    "swatch.width = 1;",
    "swatch.height = 1;",
    "const swatchCtx = swatch.getContext(\"2d\", { colorSpace: \"srgb\" });",
    "function parseColor(text) {",
    "  swatchCtx.fillStyle = \"#000\";",
    "  swatchCtx.fillRect(0, 0, 1, 1);",
    "  swatchCtx.fillStyle = text.trim();",
    "  swatchCtx.fillRect(0, 0, 1, 1);",
    "  const px = swatchCtx.getImageData(0, 0, 1, 1).data;",
    "  if (px[3] === 0) return null;",
    "  return [px[0], px[1], px[2]];",
    "}",
    "function verdict(ratio) {",
    "  return { normal: ratio >= 4.5, large: ratio >= 3, pass: ratio >= 4.5 };",
    "}",
    "function probeFor(palette, mode) {",
    "  const probe = document.createElement(\"div\");",
    "  probe.setAttribute(\"data-theme\", palette);",
    "  probe.setAttribute(\"data-mode\", mode);",
    "  probe.setAttribute(\"aria-hidden\", \"true\");",
    "  probe.className = \"probe\";",
    "  document.body.appendChild(probe);",
    "  return probe;",
    "}",
    "function readTokens(palette, mode) {",
    "  const probe = probeFor(palette, mode);",
    "  const styles = getComputedStyle(probe);",
    "  const values = {};",
    "  for (const name of TOKENS) values[name] = styles.getPropertyValue(name).trim();",
    "  probe.remove();",
    "  return values;",
    "}",
    "function badgeText(result) {",
    "  return result ? \"PASS\" : \"FAIL\";",
    "}",
    "function renderCard(card) {",
    "  const palette = card.dataset.palette;",
    "  const light = readTokens(palette, \"light\");",
    "  const dark = readTokens(palette, \"dark\");",
    "  const rows = card.querySelector(\"[data-token-rows]\");",
    "  for (const name of TOKENS) {",
    "    const row = document.createElement(\"tr\");",
    "    const head = document.createElement(\"th\");",
    "    head.scope = \"row\";",
    "    head.textContent = name;",
    "    const lightCell = document.createElement(\"td\");",
    "    const darkCell = document.createElement(\"td\");",
    "    lightCell.textContent = light[name] || \"(unset)\";",
    "    darkCell.textContent = dark[name] || \"(unset)\";",
    "    row.append(head, lightCell, darkCell);",
    "    rows.appendChild(row);",
    "  }",
    "  const list = card.querySelector(\"[data-verdicts]\");",
    "  let failing = false;",
    "  for (const mode of [\"light\", \"dark\"]) {",
    "    const values = mode === \"light\" ? light : dark;",
    "    for (const pair of PAIRS) {",
    "      const a = parseColor(values[pair.a] || \"\");",
    "      const b = parseColor(values[pair.b] || \"\");",
    "      const item = document.createElement(\"li\");",
    "      item.dataset.mode = mode;",
    "      item.dataset.pair = pair.key;",
    "      const title = document.createElement(\"strong\");",
    "      title.textContent = mode + \" / \" + pair.label;",
    "      item.appendChild(title);",
    "      if (!a || !b) {",
    "        const missing = document.createElement(\"span\");",
    "        missing.className = \"badge missing\";",
    "        missing.textContent = \"NO VALUE\";",
    "        item.appendChild(missing);",
    "        item.dataset.result = \"missing\";",
    "        failing = true;",
    "      } else {",
    "        const ratio = ratioOf(luminance(a[0], a[1], a[2]), luminance(b[0], b[1], b[2]));",
    "        const result = verdict(ratio);",
    "        const number = document.createElement(\"span\");",
    "        number.className = \"ratio\";",
    "        number.textContent = ratio.toFixed(2) + \":1\";",
    "        const badge = document.createElement(\"span\");",
    "        badge.className = \"badge \" + (result.pass ? \"pass\" : \"fail\");",
    "        badge.textContent = badgeText(result.pass);",
    "        const detail = document.createElement(\"span\");",
    "        detail.className = \"detail\";",
    "        detail.textContent = \"AA normal \" + (result.normal ? \"pass\" : \"fail\") + \", large \" + (result.large ? \"pass\" : \"fail\");",
    "        item.append(title, number, badge, detail);",
    "        item.dataset.result = result.pass ? \"pass\" : \"SI_SECRET_PASSWORD_P1QYUTMJ\";",
    "        if (!result.pass) failing = true;",
    "      }",
    "      list.appendChild(item);",
    "    }",
    "  }",
    "  card.dataset.status = failing ? \"failing\" : \"passing\";",
    "  if (document.body.dataset.filter === \"failing\" && !failing) card.hidden = true;",
    "}",
    "function renderAll() {",
    "  for (const card of document.querySelectorAll(\".card\")) renderCard(card);",
    "}",
    "function setFilter(value) {",
    "  document.body.dataset.filter = value;",
    "  for (const button of document.querySelectorAll(\".toolbar [data-filter]\")) {",
    "    button.setAttribute(\"aria-pressed\", String(button.dataset.filter === value));",
    "  }",
    "  for (const card of document.querySelectorAll(\".card\")) {",
    "    card.hidden = value === \"failing\" && card.dataset.status !== \"failing\";",
    "  }",
    "}",
    "for (const button of document.querySelectorAll(\".toolbar [data-filter]\")) {",
    "  button.addEventListener(\"click\", () => setFilter(button.dataset.filter));",
    "}",
    "renderAll();",
  ].join("\n");
}

export function renderGallery(palettes: readonly GalleryPalette[], css: string, builtAt: string): string {
  const cards = palettes.flatMap((palette) => [cardHtml(palette)]).join("\n");
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>Aven theme gallery (${palettes.length} palettes)</title>`,
    "<style>",
    css,
    ":root { color-scheme: light dark; }",
    "body.album { margin: 0 auto; max-width: 72rem; padding: 2rem 1rem 4rem; font-family: system-ui, sans-serif; background: #fff; color: #111; }",
    ".toolbar { display: flex; gap: 0.5rem; align-items: center; margin: 1rem 0 2rem; }",
    ".toolbar button { padding: 0.5rem 1rem; border: 1px solid #666; border-radius: 0.5rem; background: #fff; }",
    '.toolbar button[aria-pressed="true"] { background: #111; color: #fff; }',
    ".toolbar button:focus-visible { outline: 3px solid #005fcc; outline-offset: 2px; }",
    ".card { border: 1px solid #ccc; border-radius: 0.75rem; padding: 1rem; margin-bottom: 2rem; }",
    ".shots { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }",
    ".shots img { width: 100%; height: auto; border: 1px solid #ddd; border-radius: 0.5rem; }",
    ".tokens { border-collapse: collapse; margin-top: 1rem; width: 100%; }",
    ".tokens th, .tokens td { border: 1px solid #ddd; padding: 0.25rem 0.5rem; text-align: left; font-size: 0.85rem; }",
    ".tokens code, td { font-family: ui-monospace, monospace; }",
    ".verdicts { list-style: none; padding: 0; display: grid; gap: 0.5rem; margin-top: 1rem; }",
    ".verdicts li { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; border: 1px solid #ddd; border-radius: 0.5rem; padding: 0.5rem 0.75rem; }",
    ".badge { padding: 0.1rem 0.5rem; border-radius: 999px; font-weight: 700; font-size: 0.75rem; }",
    ".badge.pass { background: #0b6e3f; color: #fff; }",
    ".badge.fail { background: #b42318; color: #fff; }",
    ".badge.missing { background: #666; color: #fff; }",
    ".probe { position: absolute; width: 0; height: 0; overflow: hidden; visibility: hidden; }",
    "@media (prefers-reduced-motion: reduce) { * { animation: none; transition: none; } }",
    "</style>",
    "</head>",
    `<body class="album" data-filter="all">`,
    "<header>",
    "<h1>Aven theme gallery</h1>",
    `<p>Built ${escapeHtml(builtAt)}. Each card shows the captured Light and Dark screenshots, the token values, and contrast verdicts computed in this browser.</p>`,
    '<div class="toolbar" role="group" aria-label="Filter cards">',
    '<button type="button" data-filter="all" aria-pressed="true">All</button>',
    '<button type="button" data-filter="failing" aria-pressed="false">Failing only</button>',
    "</div>",
    "</header>",
    "<main>",
    cards,
    "</main>",
    "<script>",
    pageScript(),
    "</script>",
    "</body>",
    "</html>",
    "",
  ].join("\n");
}

if (import.meta.main) {
  const builtAt = new Date().toISOString();
  const html = renderGallery(galleryPalettes, readThemeCss(), builtAt);
  await Bun.write(outPath, html);
  console.log(`wrote ${outPath} (${galleryPalettes.length} palettes)`);
}
