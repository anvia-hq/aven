import { ChangesBadge } from "@/modules/diff/components/changes-badge";
import type { useThreadDiff } from "@/modules/diff/hooks/use-thread-diff";

import type { Thread } from "../types";
import { ShipButton } from "./ship-button";

type Props = {
  thread: Thread;
  unshipped: ReturnType<typeof useThreadDiff>;
};

export function ShipBar({ thread, unshipped }: Props) {
  return (
    <div className="flex items-center justify-end gap-2 pb-2">
      <ChangesBadge
        empty={unshipped.files.length === 0}
        additions={unshipped.additions}
        deletions={unshipped.deletions}
      />
      <ShipButton
        thread={thread}
        changesKnown={unshipped.loaded}
        upToDate={unshipped.loaded && !unshipped.problem && unshipped.files.length === 0}
      />
    </div>
  );
}
