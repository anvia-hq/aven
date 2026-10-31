import { ChangesBadge } from "@/modules/diff/components/changes-badge";
import type { useThreadDiff } from "@/modules/diff/hooks/use-thread-diff";

import type { Thread } from "../types";
import { ShipButton } from "./ship-button";

type Props = {
  thread: Thread;
  /** What the pull request does not have yet (everything, before there is one). */
  unshipped: ReturnType<typeof useThreadDiff>;
};

// The row above the composer: the lines the branch changes, and the button that ships them. Update
// PR has nothing to send while the pull request already has every change.
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
        upToDate={unshipped.loaded && !unshipped.problem && unshipped.files.length === 0}
      />
    </div>
  );
}
