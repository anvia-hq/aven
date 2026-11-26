import { useMemo } from "react";
import { encode } from "uqr";

type Props = {
  value: string;
  size?: number;
};

const QUIET_ZONE = 2;

export function QrCode({ value, size = 216 }: Props) {
  const { viewBoxSize, path } = useMemo(() => {
    const { size: matrixSize, data } = encode(value, { ecc: "M" });
    const segments: string[] = [];

    for (let y = 0; y < matrixSize; y += 1) {
      const row = data[y];

      if (!row) continue;

      for (let x = 0; x < matrixSize; x += 1) {
        if (row[x]) {
          segments.push(`M${x + QUIET_ZONE},${y + QUIET_ZONE}h1v1h-1z`);
        }
      }
    }

    return {
      viewBoxSize: matrixSize + QUIET_ZONE * 2,
      path: segments.join(""),
    };
  }, [value]);

  return (
    <div
      data-theme="aven"
      className="inline-flex rounded-xl border border-border bg-card p-3 text-card-foreground shadow-xs"
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
        role="img"
        aria-label="Mobile sign-in QR code"
        shapeRendering="crispEdges"
      >
        <path d={path} fill="currentColor" />
      </svg>
    </div>
  );
}
