import { useEffect, useState } from "react";

import type { HighlightedLine } from "../highlight";

type Coloured = { text: string; path: string; lines: HighlightedLine[] };

// The coloured lines of a file, which arrive after the text does: until they do, and for a file
// that cannot be coloured, this is null and the caller shows the text plain. Colours made for
// other text are never shown against this one.
export function useHighlightedLines(text: string, path: string) {
  const [coloured, setColoured] = useState<Coloured | null>(null);

  useEffect(() => {
    let current = true;
    // The highlighter is a large library: it is fetched when the first file is opened, not with the page.
    import("../highlight")
      .then(({ highlight }) => highlight(text, path))
      .then((lines) => {
        if (current && lines) setColoured({ text, path, lines });
      })
      // A grammar that will not load leaves the file plain.
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [text, path]);

  return coloured?.text === text && coloured.path === path ? coloured.lines : null;
}
