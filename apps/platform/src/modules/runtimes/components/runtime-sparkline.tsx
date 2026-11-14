import { cn } from "cn";

type Props = {
  points: number[];
  className?: string;
  ariaLabel?: string;
};

const WIDTH = 120;
const HEIGHT = 26;

export function lineOf(points: number[]) {
  if (points.length === 0) return "";

  if (points.length === 1) return `M0,${HEIGHT - 3} L${WIDTH.toFixed(1)},${HEIGHT - 3}`;

  const peak = Math.max(...points, 1);

  return points
    .map((point, index) => {
      const x = (index / (points.length - 1)) * WIDTH;
      const y = HEIGHT - 3 - (point / peak) * (HEIGHT - 6);
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export function RuntimeSparkline({ points, className, ariaLabel }: Props) {
  if (points.length === 0) {
    return <span className={cn("block", className)} aria-hidden={ariaLabel === undefined} />;
  }

  const flat = points.length < 2;

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      role={ariaLabel === undefined ? undefined : "img"}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel === undefined}
      className={cn("block w-full text-meter-low", className)}
    >
      <path
        d={lineOf(points)}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        strokeDasharray={flat ? "3 3" : undefined}
        opacity={flat ? 0.5 : 1}
      />
    </svg>
  );
}
