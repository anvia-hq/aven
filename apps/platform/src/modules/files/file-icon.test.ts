import { describe, expect, test } from "bun:test";

import { fileIconName } from "./file-icon";
import type { FileIconTheme } from "./types";

const theme: FileIconTheme = {
  file: "file",
  fileNames: { "package.json": "nodejs", "agents.md": "agent" },
  fileExtensions: { md: "markdown", "d.ts": "typescript-def", ts: "typescript" },
  iconDefinitions: {
    file: { iconPath: "./../icons/file.svg" },
    nodejs: { iconPath: "./../icons/nodejs.svg" },
    agent: { iconPath: "./../icons/agent.svg" },
    markdown: { iconPath: "./../icons/markdown.svg" },
    "typescript-def": { iconPath: "./../icons/typescript-def.svg" },
    typescript: { iconPath: "./../icons/typescript.svg" },
  },
};

describe("the icon of a file", () => {
  test("a known name wins over its extension, whatever the case or folder", () => {
    expect(fileIconName(theme, "apps/Package.json")).toBe("nodejs");
    expect(fileIconName(theme, "AGENTS.md")).toBe("agent");
  });

  test("an extension is matched longest first", () => {
    expect(fileIconName(theme, "src/a.d.ts")).toBe("typescript-def");
    expect(fileIconName(theme, "src/a.ts")).toBe("typescript");
    expect(fileIconName(theme, "docs/index.md")).toBe("markdown");
  });

  test("anything else is a plain file", () => {
    expect(fileIconName(theme, "LICENSE")).toBe("file");
    expect(fileIconName(theme, "weird.unknownext")).toBe("file");
  });
});
