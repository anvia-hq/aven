import { DiffStat } from "./diff-stat";

type Props = { empty: boolean; additions: number; deletions: number };

export function ChangesBadge({ empty, additions, deletions }: Props) {
  if (empty) return null;
  return (
    <p
      className="rounded-lg border bg-background px-2 py-1 font-mono text-xs shadow-md"
      title="Changes not shipped yet"
    >
      <DiffStat additions={additions} deletions={deletions} />
    </p>
  );
}
