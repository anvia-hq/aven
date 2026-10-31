import { useEffect, useState } from "react";

import type { HighlightedLine } from "../highlight";

const KEPT = 50;

// Colours made for files seen, so one opened again is coloured on its first frame.
const made = new Map<string, HighlightedLine[]>();

const keyOf = (text: string, path: string) => `${path}\0${text}`;

function remember(key: string, lines: HighlightedLine[]) {
  made.delete(key);
  made.set(key, lines);
  if (made.size > KEPT) made.delete(made.keys().next().value as string);
}

// The coloured lines of a file, which arrive after the text does: until they do, and for a file
// that cannot be coloured, this is null and the caller shows the text plain. Colours made for
// other text are never shown against this one.
export function useHighlightedLines(text: string, path: string) {
  const [, arrived] = useState(0);
  const key = keyOf(text, path);

  useEffect(() => {
    if (made.has(key)) return;
    let current = true;
    // The highlighter is a large library: it is fetched when the first file is opened, not with the page.
    import("../highlight")
      .then(({ highlight }) => highlight(text, path))
      .then((lines) => {
        if (!lines) return;
        remember(key, lines);
        if (current) arrived((count) => count + 1);
      })
      // A grammar that will not load leaves the file plain.
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [key, text, path]);

  return made.get(key) ?? null;
}
