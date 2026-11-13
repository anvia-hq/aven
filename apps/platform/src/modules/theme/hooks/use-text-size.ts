import { useAtom } from "jotai";
import type { CSSProperties } from "react";

import { textSizeAtoms } from "../atoms/text-size-atoms";
import { TEXT_SIZES } from "../types";
import type { TextSizeScope } from "../types";

export const scaleOf = (id: string) => TEXT_SIZES.find((option) => option.id === id)?.scale ?? 1;

export function useTextSize(scope: TextSizeScope) {
  const [size, setSize] = useAtom(textSizeAtoms[scope]);
  const scale = scaleOf(size);
  const style: CSSProperties | undefined = scale === 1 ? undefined : { zoom: scale };
  return { size, setSize, style };
}
