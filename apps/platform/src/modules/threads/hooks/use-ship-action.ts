import { useCallback, useEffect } from "react";

import { useThreadDiff } from "@/modules/diff/hooks/use-thread-diff";
import { useGithubAccount } from "@/modules/projects/hooks/use-github-account";

import { connectionOf, shipActionOf } from "../ship-state";
import type { OutgoingMessage, RunSelection, Thread } from "../types";
import { useBranchPullRequests } from "./use-branch-pull-requests";
import { useShipReadiness } from "./use-ship-readiness";
import { useShipThread } from "./use-ship-thread";
import { useThreads } from "./use-threads";

type Send = (message: OutgoingMessage, selection?: RunSelection) => Promise<boolean>;

const SETUP_SKILL = "setup-ship";
const SETUP_COMMAND = `/${SETUP_SKILL}`;

export function useShipAction(
  thread: Thread,
  unshipped: ReturnType<typeof useThreadDiff>,
  showShip: () => () => void,
  send: Send,
  selection: RunSelection,
) {
  const { shipping, ship } = useShipThread(thread, showShip, selection);
  const { gate, machine } = useShipReadiness(thread.id, thread.running);
  const account = useGithubAccount();
  const connected = connectionOf({
    machine,
    account,
  });
  const changes = {
    loaded: unshipped.loaded,
    available: unshipped.available,
    problem: unshipped.problem,
    any: unshipped.fileCount > 0,
  };
  const needsBranch =
    connected === true &&
    !shipping &&
    !thread.running &&
    changes.loaded &&
    changes.problem === null &&
    changes.available !== false &&
    !changes.any &&
    thread.pullRequests.length === 0;
  const branch = useThreadDiff(thread.id, "all", thread.running, needsBranch, {
    summaryOnly: true,
  });
  const branchPulls = useBranchPullRequests(
    thread.id,
    connected === true &&
      !changes.any &&
      thread.pullRequests.length === 0 &&
      branch.loaded &&
      branch.problem === null &&
      branch.fileCount > 0,
    thread.running,
  );
  const { refresh } = useThreads();
  useEffect(() => {
    if (branchPulls.any) void refresh();
  }, [branchPulls.any, refresh]);
  const action = shipActionOf({
    running: thread.running,
    shipping,
    gate,
    connected,
    changes,
    branch: {
      loaded: branch.loaded,
      available: branch.available,
      problem: branch.problem,
      any: branch.fileCount > 0,
    },
    branchPulls,
    pullRequests: thread.pullRequests,
  });

  const setUp = useCallback(() => {
    void send(
      {
        prompt: SETUP_COMMAND,
        attachments: [],
        mentions: [{ type: "skill", name: SETUP_SKILL, from: 0, to: SETUP_COMMAND.length }],
      },
      selection,
    );
  }, [send, selection]);

  return { action, ship, setUp };
}
