import { useCallback } from "react";

import { tileColors } from "@/lib/tile";
import { MarkCanvas } from "@/modules/marks/components/mark-canvas";
import type { MarkFrame, OrbColors } from "@/modules/marks/types";

import { paintBox } from "../box-art";

type Props = {
  projectId: string;
  palette?: number;
  colors?: OrbColors;
  working?: boolean;
  speed?: number;
  decorative?: boolean;
  className?: string;
};

export function ComputerTile({
  projectId,
  palette,
  colors,
  working = false,
  speed = 1,
  decorative = false,
  className,
}: Props) {
  const [first, second, third] = colors ?? tileColors(projectId, palette);
  const paint = useCallback(
    (context: CanvasRenderingContext2D, { size, ink, color, turn }: MarkFrame) =>
      paintBox(context, size, { ink, colors: [first, second, third], color, turn }),
    [first, second, third],
  );

  return (
    <MarkCanvas
      paint={paint}
      working={working}
      speed={speed}
      decorative={decorative}
      className={className}
    />
  );
}
