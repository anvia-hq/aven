import { useCallback, useMemo } from "react";

import { MarkCanvas } from "@/modules/marks/components/mark-canvas";
import type { MarkFrame } from "@/modules/marks/types";
import { tileColors, tileSeed } from "@/modules/projects/tile";

import { boxRotation, boxShape, paintBox } from "../box-art";

type Props = {
  projectId: string;
  palette?: number;
  working?: boolean;
  speed?: number;
  decorative?: boolean;
  className?: string;
};

export function ComputerTile({
  projectId,
  palette,
  working = false,
  speed = 1,
  decorative = false,
  className,
}: Props) {
  const shape = useMemo(() => boxShape(tileSeed(projectId)), [projectId]);
  const [first, second, third] = tileColors(projectId, palette);
  const paint = useCallback(
    (context: CanvasRenderingContext2D, { size, ink, color, time }: MarkFrame) =>
      paintBox(context, size, shape, {
        ink,
        colors: [first, second, third],
        color,
        time,
        rotation: boxRotation(shape, time, "tumble"),
      }),
    [shape, first, second, third],
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
