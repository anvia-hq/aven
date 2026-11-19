import type { ChatMessage } from "@aven/protocol/types";

import { threadDocx } from "./export-docx";
import { transcriptOf } from "./transcript";
import type { ExportFormat, TranscriptEntry } from "./types";

function joinEntries(
  entries: readonly TranscriptEntry[],
  render: (entry: TranscriptEntry) => string,
) {
  let joined = "";

  entries.forEach((entry, index) => {
    const text = render(entry);

    if (index === 0) {
      joined = text;
      return;
    }

    const tight = entries[index - 1]?.kind === "bullet" && entry.kind === "bullet";
    joined = `${joined}${tight ? "\n" : "\n\n"}${text}`;
  });

  return joined;
}

function markdownEntry(entry: TranscriptEntry) {
  if (entry.kind === "heading") return `${"#".repeat(entry.level)} ${entry.text}`;

  if (entry.kind === "reasoning")
    return `<details>\n<summary>Reasoning</summary>\n\n${entry.text}\n</details>`;

  if (entry.kind === "bullet")
    return entry.code ? `- \`${entry.code}\` ${entry.text}` : `- ${entry.text}`;

  return entry.text;
}

function textEntry(entry: TranscriptEntry) {
  if (entry.kind === "reasoning") return `Reasoning:\n${entry.text}`;

  if (entry.kind === "bullet")
    return entry.code ? `- ${entry.code} ${entry.text}` : `- ${entry.text}`;

  return entry.text;
}

export function threadMarkdown(title: string, messages: readonly ChatMessage[]) {
  return `${joinEntries(transcriptOf(title, messages), markdownEntry)}\n`;
}

export function threadText(title: string, messages: readonly ChatMessage[]) {
  return `${joinEntries(transcriptOf(title, messages), textEntry)}\n`;
}

function escapeHtml(text: string) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function htmlLines(text: string) {
  return escapeHtml(text).replaceAll("\n", "<br/>");
}

function htmlBody(entries: readonly TranscriptEntry[]) {
  const parts: string[] = [];
  let bullets: string[] = [];

  function flushBullets() {
    if (bullets.length === 0) return;

    parts.push(`<ul>\n${bullets.join("\n")}\n</ul>`);
    bullets = [];
  }

  for (const entry of entries) {
    if (entry.kind === "bullet") {
      const code = entry.code ? `<code>${escapeHtml(entry.code)}</code> ` : "";
      bullets.push(`<li>${code}${htmlLines(entry.text)}</li>`);
      continue;
    }

    flushBullets();

    if (entry.kind === "heading") {
      parts.push(`<h${entry.level}>${escapeHtml(entry.text)}</h${entry.level}>`);
    } else if (entry.kind === "reasoning") {
      parts.push(
        `<section class="reasoning"><h3>Reasoning</h3><p>${htmlLines(entry.text)}</p></section>`,
      );
    } else {
      parts.push(`<p>${htmlLines(entry.text)}</p>`);
    }
  }

  flushBullets();
  return parts.join("\n");
}

const PRINT_STYLE = [
  "@page { margin: 18mm; }",
  "body { max-width: 46rem; margin: 0 auto; padding: 2rem; color: #111; font: 16px/1.5 ui-sans-serif, system-ui, sans-serif; }",
  "h1 { font-size: 1.5rem; }",
  "h2 { margin-top: 2rem; font-size: 1rem; }",
  "code { font-family: ui-monospace, SFMono-Regular, monospace; }",
  ".reasoning { margin: 1rem 0; padding-left: 1rem; border-left: 3px solid #ddd; color: #444; }",
  ".reasoning h3 { font-size: 0.75rem; letter-spacing: 0.08em; text-transform: uppercase; }",
  ".print { position: fixed; top: 1rem; right: 1rem; padding: 0.4rem 0.9rem; }",
  "@media print { .print { display: none; } body { padding: 0; } }",
].join("\n");

export function threadHtml(title: string, messages: readonly ChatMessage[]) {
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    `<title>${escapeHtml(title)}</title>`,
    `<style>${PRINT_STYLE}</style>`,
    "</head>",
    "<body>",
    '<button class="print" onclick="window.print()">Print</button>',
    htmlBody(transcriptOf(title, messages)),
    '<script>window.addEventListener("load", () => window.print())</script>',
    "</body>",
    "</html>",
    "",
  ].join("\n");
}

const CONTENT_TYPES: Record<ExportFormat, string> = {
  md: "text/markdown; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  html: "text/html; charset=utf-8",
};

export function exportFormat(value: string | undefined): ExportFormat {
  if (value === "txt" || value === "docx" || value === "html") return value;

  return "md";
}

export function exportContentType(format: ExportFormat) {
  return CONTENT_TYPES[format];
}

export function renderExport(
  format: ExportFormat,
  title: string,
  messages: readonly ChatMessage[],
): string | Uint8Array<ArrayBuffer> {
  if (format === "docx") return threadDocx(title, messages);

  if (format === "txt") return threadText(title, messages);

  if (format === "html") return threadHtml(title, messages);

  return threadMarkdown(title, messages);
}
