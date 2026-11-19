import { describe, expect, test } from "bun:test";

import { exportFileName } from "./export-formats";

describe("exportFileName", () => {
  test("slugs the title and adds the format's extension", () => {
    expect(exportFileName("Fix the export button", "md")).toBe("fix-the-export-button.md");
    expect(exportFileName("Fix the export button", "docx")).toBe("fix-the-export-button.docx");
    expect(exportFileName("Fix the export button", "txt")).toBe("fix-the-export-button.txt");
  });

  test("falls back to thread when the title has no letters or digits", () => {
    expect(exportFileName("!!! ???", "md")).toBe("thread.md");
    expect(exportFileName("", "docx")).toBe("thread.docx");
  });
});
