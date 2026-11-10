import { GitPullRequest, Github, Refresh, Rocket, Sparkles } from "@mynaui/icons-react";

import { Button } from "@/components/button";
import { ButtonGroup } from "@/components/button-group";
import { FLOATING_BUTTON } from "@/lib/floating-button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/tooltip";

import type { ShipAct } from "../types";
import { ShipMenu } from "./ship-menu";

type Props = {
  action: ShipAct;
  threadId: string;
  onShip: (mode?: "new") => void;
  onSetUp: () => void;
  onRetry: () => void;
};

const UNKNOWN_GATE =
  "Could not check whether the repository is set up to ship. Is its runner online?";

export function ShipButton({ action, threadId, onShip, onSetUp, onRetry }: Props) {
  if (action.kind === "loading") {
    return <span className="h-7 w-28 opacity-0" role="status" aria-label="Reading the changes" />;
  }
  if (action.kind === "failed") {
    return (
      <Button
        variant="outline"
        size="sm"
        className={FLOATING_BUTTON}
        title={action.reason}
        onClick={onRetry}
      >
        <Refresh />
        Try again
      </Button>
    );
  }
  if (action.kind === "set-up") {
    return (
      <Button
        variant="outline"
        size="sm"
        className={FLOATING_BUTTON}
        disabled={action.disabled}
        onClick={onSetUp}
      >
        <Sparkles />
        Set up shipping
      </Button>
    );
  }
  if (action.kind === "connect") {
    const next = encodeURIComponent(`/threads/${threadId}`);
    const app = action.appKey ? `&app=${encodeURIComponent(action.appKey)}` : "";
    return (
      <Button
        size="sm"
        className="shadow-md"
        nativeButton={false}
        render={<a href={`/api/github/connect?next=${next}${app}`} />}
      >
        <Github />
        Connect GitHub to ship
      </Button>
    );
  }
  if (action.kind === "blocked") {
    return (
      <Tooltip>
        <TooltipTrigger render={<span tabIndex={0} className="inline-flex" />}>
          <Button variant="outline" size="sm" className={FLOATING_BUTTON} disabled>
            <Rocket />
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
        <GitPullRequest />
        Open a PR
      </Button>
    );
  }
  if (action.kind === "none") return null;
  return (
    <ButtonGroup>
      <Button
        variant={action.label === "Ship" ? "default" : "outline"}
        size="sm"
        className={action.label === "Ship" ? "shadow-md" : FLOATING_BUTTON}
        disabled={action.disabled}
        onClick={() => onShip()}
      >
        <Rocket />
        {action.shipping ? "Shipping…" : action.label}
      </Button>
      {action.canOpenNew && <ShipMenu disabled={action.disabled} onNew={() => onShip("new")} />}
    </ButtonGroup>
  );
}
