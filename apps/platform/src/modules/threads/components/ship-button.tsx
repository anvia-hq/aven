import { ExternalLink, Github, Rocket } from "@mynaui/icons-react";

import { Button } from "@/components/button";
import { ButtonGroup } from "@/components/button-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/tooltip";
import { useGithubAccount } from "@/modules/projects/hooks/use-github-account";

import { useShipReadiness, type ShipGate } from "../hooks/use-ship-readiness";
import { useShipThread } from "../hooks/use-ship-thread";
import type { Thread, ThreadPullRequest } from "../types";
import { ShipMenu } from "./ship-menu";

type Props = {
  thread: Thread;
  /** Whether the pull request already has everything the thread changed; there is nothing to update. */
  upToDate: boolean;
};

// Ships the thread as a pull request, as the person; once there is one, it links to it and ships
// again as an update while it is open, and as a new pull request once it is merged or closed. A
// menu offers a separate pull request even while one is open (decision 0069).
export function ShipButton({ thread, upToDate }: Props) {
  const { shipping, ship } = useShipThread(thread);
  const { gate, appKey } = useShipReadiness(thread.id, thread.running);
  // The connection that counts is the one for the app the project is of (decision 0123); nothing
  // is asked until the thread has said which.
  const account = useGithubAccount(appKey);
  // The newest pull request is the one an update goes to.
  const [latest] = thread.pullRequests;
  const shipped = latest !== undefined;
  const canUpdate = latest?.state === "open";
  const label = shipLabel(latest);
  const blocked = thread.running || shipping || (shipped && upToDate) || gate.kind !== "ready";
  // What is shipped is the person's own on GitHub, so their account has to be connected first.
  if (account?.data && !account.data.connected) {
    const next = encodeURIComponent(`/threads/${thread.id}`);
    return (
      <Button
        size="sm"
        className="shadow-md"
        nativeButton={false}
        render={
          <a
            href={`/api/github/connect?next=${next}${appKey ? `&app=${encodeURIComponent(appKey)}` : ""}`}
          />
        }
      >
        <Github />
        Connect GitHub to ship
      </Button>
    );
  }
  const group = (
    <ButtonGroup>
      <Button
        variant={shipped ? "outline" : "default"}
        size="sm"
        className="shadow-md"
        disabled={blocked}
        title={shipped && upToDate ? "Nothing new since the last push" : undefined}
        onClick={() => void ship()}
      >
        <Rocket />
        {shipping ? "Shipping…" : label}
      </Button>
      {(canUpdate || thread.pullRequests.length > 1) && (
        <ShipMenu
          pullRequests={thread.pullRequests}
          canUpdate={canUpdate}
          disabled={blocked}
          onNew={() => void ship("new")}
        />
      )}
    </ButtonGroup>
  );
  const explanation = gateMessage(gate);
  return (
    <>
      {latest && (
        <Button
          variant="secondary"
          size="sm"
          className="shadow-md"
          nativeButton={false}
          role="link"
          render={<a href={latest.url} target="_blank" rel="noreferrer" />}
        >
          #{latest.number}
          <ExternalLink />
        </Button>
      )}
      {explanation ? (
        // A disabled button says nothing on hover, so the tooltip hangs on what holds it.
        <Tooltip>
          <TooltipTrigger render={<span tabIndex={0} className="inline-flex" />}>
            {group}
          </TooltipTrigger>
          <TooltipContent>{explanation}</TooltipContent>
        </Tooltip>
      ) : (
        group
      )}
    </>
  );
}

// Why Ship is not there yet, when it is not because of the thread: the repository has to be set up
// to ship first (decision 0083).
function gateMessage(gate: ShipGate) {
  if (gate.kind === "missing") {
    return `Ship is available once the repository is set up: run ${gate.commands.join(" and ")} in this thread first.`;
  }
  if (gate.kind === "unknown") {
    return "Could not check whether the repository is set up to ship. Is its runner online?";
  }
  return undefined;
}

// Update while the newest pull request is open; otherwise the work goes into a new one.
function shipLabel(latest: ThreadPullRequest | undefined) {
  if (!latest) return "Ship";
  return latest.state === "open" ? "Update PR" : "New PR";
}
