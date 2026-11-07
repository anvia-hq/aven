import { useEffect, useState } from "react";
import type { HighlightedLine } from "../types";

const KEPT = 50;

const made = new Map<string, HighlightedLine[]>();

const keyOf = (text: string, path: string) => `${path}\0${text}`;

function remember(key: string, lines: HighlightedLine[]) {
  made.delete(key);
  made.set(key, lines);
  if (made.size > KEPT) made.delete(made.keys().next().value as string);
}

export function useHighlightedLines(text: string, path: string) {
  const [, arrived] = useState(0);
  const key = keyOf(text, path);

  useEffect(() => {
    if (made.has(key)) return;
    let current = true;
    import("../highlight")
      .then(({ highlight }) => highlight(text, path))
      .then((lines) => {
        if (!lines) return;
        remember(key, lines);
        if (current) arrived((count) => count + 1);
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [key, text, path]);

  return made.get(key) ?? null;
}
