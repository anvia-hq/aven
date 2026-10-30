import { useThreadDiff } from "../hooks/use-thread-diff";
import { DiffStat } from "./diff-stat";

type Props = { threadId: string; running: boolean };

// What shipping the thread would send, as lines added and removed: everything since its branch left
// the default branch. Nothing is shown until there is something to ship.
export function ChangesBadge({ threadId, running }: Props) {
  const { files, additions, deletions } = useThreadDiff(threadId, "all", running);
  if (files.length === 0) return null;
  return (
    <p
      className="rounded-lg border bg-background px-2 py-1 font-mono text-xs shadow-md"
      title="Changes since the branch left the default branch"
    >
      <DiffStat additions={additions} deletions={deletions} />
    </p>
  );
}
