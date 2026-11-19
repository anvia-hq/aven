import { useEffect, useState } from "react";

import { fileIconName } from "../file-icon";
import type { FileIconTheme } from "../types";

const icons = import.meta.glob<string>("/node_modules/material-icon-theme/icons/*.svg", {
  query: "?url",
  import: "default",
});
const urls = new Map<string, string>();
let theme: Promise<FileIconTheme> | undefined;

const loadTheme = () => {
  theme ??= import("material-icon-theme/dist/material-icons.json").then(
    (loaded) => loaded.default as FileIconTheme,
  );
  return theme;
};

async function urlOf(path: string) {
  const name = fileIconName(await loadTheme(), path);
  const known = urls.get(name);

  if (known) return known;

  const load = icons[`/node_modules/material-icon-theme/icons/${name}.svg`];
  const url = load ? await load() : null;

  if (url) urls.set(name, url);

  return url;
}

export function useFileIcon(path: string) {
  const [shown, setShown] = useState<{ path: string; url: string | null } | null>(null);

  useEffect(() => {
    let current = true;
    urlOf(path)
      .then((url) => current && setShown({ path, url }))
      .catch(() => current && setShown({ path, url: null }));
    return () => {
      current = false;
    };
  }, [path]);

  return shown?.path === path ? shown.url : null;
}
