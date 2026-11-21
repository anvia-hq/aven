import { useEffect, useMemo, useState } from "react";

import type { HighlightedLine } from "@/modules/files/types";

import type { DiffFile, DiffRow, FileColours } from "../types";

const made = new WeakMap<DiffFile, FileColours>();
const pending = new WeakSet<DiffFile>();

function sides(file: DiffFile) {
  const oldLines: string[] = [];
  const newLines: string[] = [];
  const at = new Map<DiffRow, { side: "old" | "new"; index: number }>();
  for (const hunk of file.hunks) {
    for (const row of hunk.rows) {
      if (row.kind === "del") {
        at.set(row, { side: "old", index: oldLines.length });
        oldLines.push(row.text);
        continue;
      }

      if (row.kind === "ctx") oldLines.push(row.text);

      at.set(row, { side: "new", index: newLines.length });
      newLines.push(row.text);
    }
  }
  return { oldText: oldLines.join("\n"), newText: newLines.join("\n"), at };
}

const places = new WeakMap<DiffFile, ReturnType<typeof sides>>();

const placesOf = (file: DiffFile) => {
  const known = places.get(file);

  if (known) return known;

  const next = sides(file);
  places.set(file, next);
  return next;
};

export function useFileColours(visible: DiffFile[]) {
  const [, setTick] = useState(0);
  const wanted = useMemo(
    () => visible.filter((file) => !made.has(file) && !pending.has(file)),
    [visible],
  );

  useEffect(() => {
    if (wanted.length === 0) return;

    const batch = wanted.filter((file) => !made.has(file) && !pending.has(file));

    if (batch.length === 0) return;

    for (const file of batch) pending.add(file);

    void import("@/modules/files/highlight")
      .then(({ highlight }) =>
        Promise.all(
          batch.map(async (file) => {
            try {
              const { oldText, newText } = placesOf(file);
              const [old, next] = await Promise.all([
                highlight(oldText, file.path),
                highlight(newText, file.path),
              ]);
              made.set(file, { old, new: next });
            } catch {
              made.set(file, { old: null, new: null });
            } finally {
              pending.delete(file);
            }
          }),
        ),
      )
      .catch(() => {
        for (const file of batch) {
          made.set(file, { old: null, new: null });
          pending.delete(file);
        }
      })
      .finally(() => {
        setTick((count) => count + 1);
      });
  }, [wanted]);

  return (file: DiffFile, row: DiffRow): HighlightedLine | null => {
    const coloured = made.get(file);
    const place = placesOf(file).at.get(row);

    if (!coloured || !place) return null;

    return (place.side === "old" ? coloured.old : coloured.new)?.[place.index] ?? null;
  };
}
