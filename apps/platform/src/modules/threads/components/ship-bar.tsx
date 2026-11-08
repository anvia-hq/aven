import { ChangesBadge } from "@/modules/diff/components/changes-badge";
import type { useThreadDiff } from "@/modules/diff/hooks/use-thread-diff";

import type { Thread } from "../types";
import { ActionButtons } from "./action-buttons";
import { ShipButton } from "./ship-button";

type Props = {
  thread: Thread;
  unshipped: ReturnType<typeof useThreadDiff>;
};

export function ShipBar({ thread, unshipped }: Props) {
  return (
    <div className="flex items-center justify-between gap-2 pb-2">
      <div className="flex items-center gap-2">
        <ShipButton
          thread={thread}
          upToDate={unshipped.loaded && !unshipped.problem && unshipped.files.length === 0}
        />
        <ChangesBadge
          empty={unshipped.files.length === 0}
          additions={unshipped.additions}
          deletions={unshipped.deletions}
        />
      </div>
      <div className="flex items-center gap-2">
        <ActionButtons thread={thread} />
      </div>
    </div>
  );
}
