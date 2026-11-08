import { ExternalLink, Github, Rocket } from "@mynaui/icons-react";

import { Button } from "@/components/button";
import { ButtonGroup } from "@/components/button-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/tooltip";
import { useGithubAccount } from "@/modules/projects/hooks/use-github-account";

import { useShipReadiness } from "../hooks/use-ship-readiness";
import { useShipThread } from "../hooks/use-ship-thread";
import type { ShipGate, Thread, ThreadPullRequest } from "../types";
import { ShipMenu } from "./ship-menu";

type Props = {
  thread: Thread;
  changesKnown: boolean;
  upToDate: boolean;
};

export function ShipButton({ thread, changesKnown, upToDate }: Props) {
  const { shipping, ship } = useShipThread(thread);
  const { gate, appKey } = useShipReadiness(thread.id, thread.running);
  const account = useGithubAccount(appKey);
  const [latest] = thread.pullRequests;
  const shipped = latest !== undefined;
  const canUpdate = latest?.state === "open";
  const label = shipLabel(latest);
  const notSetUp = gate.kind === "missing" || gate.kind === "checking";
  const blocked = thread.running || shipping || gate.kind !== "ready";
  if (notSetUp || !changesKnown || (upToDate && !shipping)) {
    return latest ? <PullRequestLink pullRequest={latest} /> : null;
  }
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
      {latest && <PullRequestLink pullRequest={latest} />}
      {explanation ? (
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

function PullRequestLink({ pullRequest }: { pullRequest: ThreadPullRequest }) {
  return (
    <Button
      variant="secondary"
      size="sm"
      className="shadow-md"
      nativeButton={false}
      role="link"
      render={<a href={pullRequest.url} target="_blank" rel="noreferrer" />}
    >
      #{pullRequest.number}
      <ExternalLink />
    </Button>
  );
}

function gateMessage(gate: ShipGate) {
  if (gate.kind === "unknown") {
    return "Could not check whether the repository is set up to ship. Is its runner online?";
  }
  return undefined;
}

function shipLabel(latest: ThreadPullRequest | undefined) {
  if (!latest) return "Ship";
  return latest.state === "open" ? "Update PR" : "New PR";
}
