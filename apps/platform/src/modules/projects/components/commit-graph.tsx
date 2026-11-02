import type { GraphRow } from "@aven/protocol/commit-graph";

// The lines of a commit's row in the graph (decision 0090): its dot, and the lines that join it to
// the rows above and below. One lane is a column LANE_WIDTH wide, one row is ROW_HEIGHT high, and the
// rows are drawn with no gap, so that a line leaving one row is the line entering the next.
export const ROW_HEIGHT = 56;
export const LANE_WIDTH = 16;
// A history with more lanes than this has the rest cut off at the edge, not squeezed.
export const LANES_SHOWN = 8;

// Each lane has its own colour, which wraps; the classes are written out so that they are found.
const STROKES = [
  "stroke-graph-1",
  "stroke-graph-2",
  "stroke-graph-3",
  "stroke-graph-4",
  "stroke-graph-5",
  "stroke-graph-6",
];
const FILLS = [
  "fill-graph-1",
  "fill-graph-2",
  "fill-graph-3",
  "fill-graph-4",
  "fill-graph-5",
  "fill-graph-6",
];

const x = (lane: number) => lane * LANE_WIDTH + LANE_WIDTH / 2;
const middle = ROW_HEIGHT / 2;

export function CommitGraphRow({ row, lanes }: { row: GraphRow; lanes: number }) {
  const width = Math.min(lanes, LANES_SHOWN) * LANE_WIDTH;
  const line = "fill-none [stroke-linecap:round]";
  return (
    <svg
      data-slot="commit-graph"
      aria-hidden
      width={width}
      height={ROW_HEIGHT}
      viewBox={`0 0 ${width} ${ROW_HEIGHT}`}
      className="shrink-0 overflow-hidden"
    >
      {row.through.map((lane) => (
        <path
          key={`through-${lane}`}
          d={`M ${x(lane)} 0 V ${ROW_HEIGHT}`}
          strokeWidth={2}
          className={`${line} ${STROKES[lane % STROKES.length]}`}
        />
      ))}
      {row.up.map((lane) => (
        <path
          key={`up-${lane}`}
          // From the top of the row, bending in to the dot when it is on another lane.
          d={
            lane === row.lane
              ? `M ${x(lane)} 0 V ${middle}`
              : `M ${x(lane)} 0 Q ${x(lane)} ${middle} ${x(row.lane)} ${middle}`
          }
          strokeWidth={2}
          className={`${line} ${STROKES[lane % STROKES.length]}`}
        />
      ))}
      {row.down.map((lane) => (
        <path
          key={`down-${lane}`}
          // From the dot, bending out to the lane of the parent when it is on another.
          d={
            lane === row.lane
              ? `M ${x(lane)} ${middle} V ${ROW_HEIGHT}`
              : `M ${x(row.lane)} ${middle} Q ${x(lane)} ${middle} ${x(lane)} ${ROW_HEIGHT}`
          }
          strokeWidth={2}
          className={`${line} ${STROKES[lane % STROKES.length]}`}
        />
      ))}
      <circle
        cx={x(row.lane)}
        cy={middle}
        r={4.5}
        strokeWidth={2}
        className={`stroke-card ${FILLS[row.lane % FILLS.length]}`}
      />
    </svg>
  );
}
