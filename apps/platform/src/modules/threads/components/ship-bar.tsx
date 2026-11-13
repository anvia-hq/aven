import type { ReactNode } from "react";

import { ChangesBadge } from "@/modules/diff/components/changes-badge";
import { useDiffPreferences } from "@/modules/diff/hooks/use-diff-preferences";
import type { useThreadDiff } from "@/modules/diff/hooks/use-thread-diff";

import { useShipAction } from "../hooks/use-ship-action";
import type { OutgoingMessage, RunSelection, Thread, ThreadPanels } from "../types";
import { ActionButtons } from "./action-buttons";
import { GithubIdentityChip } from "./github-identity-chip";
import { PullRequestChip } from "./pull-request-chip";
import { ShipButton } from "./ship-button";

type Props = {
  thread: Thread;
  unshipped: ReturnType<typeof useThreadDiff>;
  showShip: () => () => void;
  send: (message: OutgoingMessage, selection?: RunSelection) => Promise<boolean>;
  selection: RunSelection;
  panels: ThreadPanels;
  split?: boolean;
  suggestions?: ReactNode;
};

export function ShipBar({
  thread,
  unshipped,
  showShip,
  send,
  selection,
  panels,
  split = false,
  suggestions,
}: Props) {
  const { action, ship, setUp, retry, runnerGithub } = useShipAction(
    thread,
    unshipped,
    showShip,
    send,
    selection,
  );
  const { setScope } = useDiffPreferences();

  const showChanges = () => {
    setScope("unshipped");
    panels.diff.show();
  };

  return (
    <div className="flex items-center gap-2 pb-2">
      <div className="flex shrink-0 items-center gap-2">
        <ShipButton
          action={action}
          threadId={thread.id}
          onShip={ship}
          onSetUp={setUp}
          onRetry={retry}
        />
        <PullRequestChip pullRequests={thread.pullRequests} />
        {!split && <ChangesBadge diff={unshipped} onOpen={showChanges} />}
        <GithubIdentityChip runnerGithub={runnerGithub} />
      </div>
      {suggestions}
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <ActionButtons thread={thread} />
      </div>
    </div>
  );
}
