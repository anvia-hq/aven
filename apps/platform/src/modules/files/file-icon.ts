import { baseName } from "./paths";
import type { FileIconTheme } from "./types";

const iconFile = (theme: FileIconTheme, definition: string | undefined) => {
  const path = definition ? theme.iconDefinitions[definition]?.iconPath : undefined;
  return path ? baseName(path).replace(/\.svg$/, "") : undefined;
};

export function fileIconName(theme: FileIconTheme, path: string) {
  const name = baseName(path).toLowerCase();
  const byName = iconFile(theme, theme.fileNames[name]);

  if (byName) return byName;

  const parts = name.split(".");

  for (let from = 1; from < parts.length; from += 1) {
    const byExtension = iconFile(theme, theme.fileExtensions[parts.slice(from).join(".")]);

    if (byExtension) return byExtension;
  }

  return iconFile(theme, theme.file) ?? "file";
}
