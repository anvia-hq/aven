import type { ThreadExportFormat } from "./types";

export const EXPORT_FORMATS: readonly { id: ThreadExportFormat; label: string }[] = [
  { id: "md", label: "Markdown" },
  { id: "pdf", label: "PDF" },
  { id: "docx", label: "Word" },
  { id: "txt", label: "Text" },
];

export function exportFileName(title: string, format: Exclude<ThreadExportFormat, "pdf">) {
  const stem =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "thread";

  return `${stem}.${format}`;
}
