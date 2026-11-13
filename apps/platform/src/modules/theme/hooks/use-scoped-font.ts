import { useAtom } from "jotai";
import { useEffect, type CSSProperties } from "react";

import { scopedFontAtoms } from "../atoms/scoped-font-atoms";
import { SANS_FONTS } from "../types";
import type { FontScope } from "../types";

export function useScopedFont(scope: FontScope) {
  const [choice, setChoice] = useAtom(scopedFontAtoms[scope]);
  const option = SANS_FONTS.find((item) => item.id === choice);
  const linkId = `aven-font-${scope}`;
  const query = option?.googleQuery;

  useEffect(() => {
    const existing = document.getElementById(linkId);

    if (!query) {
      existing?.remove();
      return;
    }

    const link = existing ?? document.createElement("link");

    if (!(link instanceof HTMLLinkElement)) return;

    link.id = linkId;
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?${query}&display=swap`;

    if (!existing) document.head.appendChild(link);
  }, [linkId, query]);

  const style = option
    ? ({
        "--app-font": option.family,
        "--heading-font": `var(--palette-heading-font, ${option.family})`,
      } as CSSProperties)
    : undefined;

  return { choice, setChoice, style };
}
