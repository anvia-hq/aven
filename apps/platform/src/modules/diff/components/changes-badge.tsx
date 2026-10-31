import { DiffStat } from "./diff-stat";

type Props = { empty: boolean; additions: number; deletions: number };

// What shipping the thread would send, as lines added and removed: before a pull request, everything
// since the branch left the default branch; after, what it does not have yet. Nothing is shown until
// there is something to ship.
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
