import { useAtom } from "jotai";
import type { CSSProperties } from "react";

import { useMediaQuery } from "@aven/ui/use-media-query";

import { textSizeAtoms } from "../atoms/text-size-atoms";
import { TEXT_SIZES } from "../catalog";
import type { TextSizeScope } from "../types";

const WIDE_SCREEN = "(min-width: 48rem)";

export const scaleOf = (id: string) => TEXT_SIZES.find((option) => option.id === id)?.scale ?? 1;

export function useTextSize(scope: TextSizeScope) {
  const [size, setSize] = useAtom(textSizeAtoms[scope]);
  const wide = useMediaQuery(WIDE_SCREEN);
  const scale = wide ? scaleOf(size) : 1;
  const style: CSSProperties | undefined = scale === 1 ? undefined : { zoom: scale };
  return { size, setSize, style };
}
