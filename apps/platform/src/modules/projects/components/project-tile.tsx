import { useCallback, useMemo } from "react";

import { MarkCanvas } from "@/modules/marks/components/mark-canvas";
import type { MarkFrame } from "@/modules/marks/types";

import { orbShape, paintOrb } from "../orb-art";
import type { OrbColors } from "../types";
import { tileColors, tileSeed } from "../tile";

type Props = {
  projectId: string;
  palette?: number;
  colors?: OrbColors;
  working?: boolean;
  speed?: number;
  decorative?: boolean;
  className?: string;
};

export function ProjectTile({
  projectId,
  palette,
  colors,
  working = false,
  speed = 1,
  decorative = false,
  className,
}: Props) {
  const shape = useMemo(() => orbShape(tileSeed(projectId)), [projectId]);
  const [first, second, third] = colors ?? tileColors(projectId, palette);
  const paint = useCallback(
    (context: CanvasRenderingContext2D, { size, ink, color, time }: MarkFrame) =>
      paintOrb(context, size, shape, { ink, colors: [first, second, third], color, time }),
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
