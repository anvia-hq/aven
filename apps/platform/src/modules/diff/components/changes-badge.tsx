import { Button } from "@aven/ui/button";
import { useElapsed } from "@/hooks/use-elapsed";
import { FLOATING_BUTTON } from "@/lib/floating-button";
import { SLOW_LOAD_MS } from "@/lib/slow-load";

import type { ThreadDiff } from "../types";
import { DiffStat } from "./diff-stat";

type Props = { diff: ThreadDiff; onOpen: () => void };

const PILL = `h-7 gap-1 rounded-lg border px-2.5 font-mono text-[0.8rem] font-normal ${FLOATING_BUTTON}`;

export function ChangesBadge({ diff, onOpen }: Props) {
  if (!diff.loaded) return <LoadingPill />;

  if (diff.problem) {
    return (
      <Button variant="outline" size="sm" className={PILL} title={diff.problem} onClick={onOpen}>
        Changes unknown
      </Button>
    );
  }

  if (diff.available === false) return null;

  if (diff.files.length === 0) return null;

  const counted = diff.additions > 0 || diff.deletions > 0;
  return (
    <Button
      variant="outline"
      size="sm"
      className={PILL}
      title="Changes not shipped yet"
      aria-label="Changes not shipped yet"
      onClick={onOpen}
    >
      {counted ? (
        <DiffStat additions={diff.additions} deletions={diff.deletions} />
      ) : (
        fileCount(diff.files.length)
      )}
    </Button>
  );
}

function LoadingPill() {
  const slow = useElapsed(SLOW_LOAD_MS);
  return (
    <span
      className={`${PILL} transition-opacity duration-300 ${slow ? "animate-pulse text-transparent" : "opacity-0"}`}
      role="status"
      aria-label="Changes loading"
    >
      <span aria-hidden>+00 -00</span>
    </span>
  );
}

function fileCount(files: number) {
  return `${files} ${files === 1 ? "file" : "files"}`;
}
