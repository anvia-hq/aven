import { Button } from "@aven/ui/button";
import { FLOATING_BUTTON } from "@/lib/floating-button";

import type { ThreadDiff } from "../types";
import { DiffStat } from "./diff-stat";

type Props = { diff: ThreadDiff; onOpen: () => void };

export function ChangesBadge({ diff, onOpen }: Props) {
  if (!diff.loaded) return null;

  if (diff.problem) {
    return (
      <Button
        variant="outline"
        size="sm"
        className={FLOATING_BUTTON}
        title={diff.problem}
        onClick={onOpen}
      >
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
      className={FLOATING_BUTTON}
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

function fileCount(files: number) {
  return `${files} ${files === 1 ? "file" : "files"}`;
}
