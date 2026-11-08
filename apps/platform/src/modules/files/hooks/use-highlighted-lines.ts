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

type KeptLines = { key: string; lines: HighlightedLine[] };

export function useHighlightedLines(text: string, path: string): HighlightedLine[] | null {
  const key = keyOf(text, path);
  const [kept, setKept] = useState<KeptLines | null>(() => {
    const lines = made.get(key);
    return lines ? { key, lines } : null;
  });

  useEffect(() => {
    if (kept?.key === key) return;
    const cached = made.get(key);
    if (cached) {
      setKept({ key, lines: cached });
      return;
    }
    let current = true;
    import("../highlight")
      .then(({ highlight }) => highlight(text, path))
      .then((highlighted) => {
        if (!highlighted) return;
        remember(key, highlighted);
        if (current) setKept({ key, lines: highlighted });
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [key, text, path, kept]);

  if (kept?.key === key) return kept.lines;
  return made.get(key) ?? null;
}
