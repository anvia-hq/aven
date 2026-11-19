import { IconGitPullRequest, IconRocket, IconSparkles } from "@tabler/icons-react";
import { GithubMark } from "@/components/brand-icons";

import { Button } from "@aven/ui/button";
import { ButtonGroup } from "@aven/ui/button-group";
import { FLOATING_BUTTON } from "@/lib/floating-button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@aven/ui/tooltip";

import type { ShipAct } from "../types";
import { ShipMenu } from "./ship-menu";

type Props = {
  action: ShipAct;
  threadId: string;
  onShip: (mode?: "new") => void;
  onSetUp: () => void;
};

const UNKNOWN_GATE =
  "Could not check whether the repository is set up to ship. Is its runner online?";

export function ShipButton({ action, threadId, onShip, onSetUp }: Props) {
  if (action.kind === "loading") return null;

  if (action.kind === "failed") return null;

  if (action.kind === "set-up") {
    return (
      <Button
        variant="outline"
        size="sm"
        className={FLOATING_BUTTON}
        disabled={action.disabled}
        onClick={onSetUp}
      >
        <IconSparkles />
        Set up shipping
      </Button>
    );
  }

  if (action.kind === "connect") {
    const next = encodeURIComponent(`/threads/${threadId}`);
    return (
      <Button
        size="sm"
        className="rounded-full in-data-[slot=button-group]:rounded-full shadow-md"
        nativeButton={false}
        render={<a href={`/api/github/connect?next=${next}`} />}
      >
        <GithubMark />
        Connect GitHub to ship
      </Button>
    );
  }

  if (action.kind === "blocked") {
    return (
      <Tooltip>
        <TooltipTrigger render={<span tabIndex={0} className="inline-flex" />}>
          <Button variant="outline" size="sm" className={FLOATING_BUTTON} disabled>
            <IconRocket />
            {action.label}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{UNKNOWN_GATE}</TooltipContent>
      </Tooltip>
    );
  }

  if (action.kind === "open") {
    return (
      <Button
        variant="outline"
        size="sm"
        className={FLOATING_BUTTON}
        disabled={action.disabled}
        onClick={() => onShip()}
      >
        <IconGitPullRequest />
        Open a PR
      </Button>
    );
  }

  if (action.kind === "none") return null;

  return (
    <ButtonGroup className="[&>[data-slot]:first-child]:rounded-l-full! [&>[data-slot]:not(:has(~[data-slot]))]:rounded-r-full!">
      <Button
        variant={action.primary ? "default" : "outline"}
        size="sm"
        className={
          action.primary
            ? "rounded-full in-data-[slot=button-group]:rounded-full shadow-md"
            : FLOATING_BUTTON
        }
        disabled={action.disabled}
        onClick={() => onShip()}
      >
        <IconRocket />
        {action.shipping ? "Shipping…" : action.label}
      </Button>
      {action.canOpenNew && <ShipMenu disabled={action.disabled} onNew={() => onShip("new")} />}
    </ButtonGroup>
  );
}
