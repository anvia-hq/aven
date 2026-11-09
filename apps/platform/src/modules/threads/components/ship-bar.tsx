import { ChangesBadge } from "@/modules/diff/components/changes-badge";
import { useDiffPreferences } from "@/modules/diff/hooks/use-diff-preferences";
import type { useThreadDiff } from "@/modules/diff/hooks/use-thread-diff";

import { useShipAction } from "../hooks/use-ship-action";
import type { OutgoingMessage, RunSelection, Thread, ThreadPanels } from "../types";
import { ActionButtons } from "./action-buttons";
import { PullRequestChip } from "./pull-request-chip";
import { ShipButton } from "./ship-button";

type Props = {
  thread: Thread;
  unshipped: ReturnType<typeof useThreadDiff>;
  showShip: () => () => void;
  send: (message: OutgoingMessage, selection?: RunSelection) => Promise<boolean>;
  panels: ThreadPanels;
};

export function ShipBar({ thread, unshipped, showShip, send, panels }: Props) {
  const { action, ship, setUp, retry } = useShipAction(thread, unshipped, showShip, send);
  const { setScope } = useDiffPreferences();

  const showChanges = () => {
    setScope("unshipped");
    panels.diff.show();
  };

  return (
    <div className="flex items-center justify-between gap-2 pb-2">
      <div className="flex items-center gap-2">
        <ShipButton
          action={action}
          threadId={thread.id}
          onShip={ship}
          onSetUp={setUp}
          onRetry={retry}
        />
        <PullRequestChip pullRequests={thread.pullRequests} />
        <ChangesBadge diff={unshipped} onOpen={showChanges} />
      </div>
      <div className="flex items-center gap-2">
        <ActionButtons thread={thread} />
      </div>
    </div>
  );
}
