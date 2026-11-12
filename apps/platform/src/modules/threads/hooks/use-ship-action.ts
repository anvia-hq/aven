import { useCallback, useEffect } from "react";

import { useThreadDiff } from "@/modules/diff/hooks/use-thread-diff";
import { useGithubAccount } from "@/modules/projects/hooks/use-github-account";

import { connectionOf, shipActionOf } from "../ship-state";
import type { OutgoingMessage, RunSelection, Thread } from "../types";
import { useBranchPullRequests } from "./use-branch-pull-requests";
import { useModelSelection } from "./use-model-selection";
import { useShipReadiness } from "./use-ship-readiness";
import { useShipThread } from "./use-ship-thread";
import { useThreads } from "./use-threads";

type Send = (message: OutgoingMessage, selection?: RunSelection) => Promise<boolean>;

export function useShipAction(
  thread: Thread,
  unshipped: ReturnType<typeof useThreadDiff>,
  showShip: () => () => void,
  send: Send,
) {
  const { shipping, ship } = useShipThread(thread, showShip);
  const { gate, appKey, machine } = useShipReadiness(thread.id, thread.running);
  const account = useGithubAccount(appKey);
  const { selection } = useModelSelection(thread.id);
  const connected = connectionOf({
    machine,
    appKey,
    checked: gate.kind !== "checking",
    account,
  });
  const changes = {
    loaded: unshipped.loaded,
    available: unshipped.available,
    problem: unshipped.problem,
    any: unshipped.files.length > 0,
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
  const branch = useThreadDiff(thread.id, "all", thread.running, needsBranch);
  const branchPulls = useBranchPullRequests(
    thread.id,
    connected === true &&
      !changes.any &&
      thread.pullRequests.length === 0 &&
      branch.loaded &&
      branch.problem === null &&
      branch.files.length > 0,
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
    appKey,
    connected,
    changes,
    branch: {
      loaded: branch.loaded,
      available: branch.available,
      problem: branch.problem,
      any: branch.files.length > 0,
    },
    branchPulls,
    pullRequests: thread.pullRequests,
  });

  const setUp = useCallback(() => {
    if (action.kind !== "set-up") return;
    void send(
      {
        prompt: action.command,
        attachments: [],
        mentions: [{ type: "skill", name: action.skill, from: 0, to: action.command.length }],
      },
      selection,
    );
  }, [action, send, selection]);

  const retry = useCallback(() => {
    unshipped.reload();
    branch.reload();
  }, [unshipped, branch]);

  return { action, ship, setUp, retry };
}
