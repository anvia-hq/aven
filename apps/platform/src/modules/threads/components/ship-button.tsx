import { IconGitPullRequest, IconRocket } from "@tabler/icons-react";
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

const SHIPS_BY_DEFAULT =
  "Commits, rebases, runs the project's checks, pushes and opens a draft PR. Use the arrow to set up shipping the way this repository does it.";
const SHIPS_BY_FILE = "Ships the way this repository's .aven/ship.md says.";

const UNKNOWN_GATE =
  "Could not check whether the repository is set up to ship. Is its runner online?";

export function ShipButton({ action, threadId, onShip, onSetUp }: Props) {
  if (action.kind === "loading") return null;

  if (action.kind === "failed") return null;

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

  if (action.kind === "none") return null;

  const { custom, disabled } = action;
  const canOpenNew = action.kind === "ship" && action.canOpenNew;
  const primary = action.kind === "ship" && action.primary;
  const shipLabel = action.kind === "ship" ? action.label : "Open a PR";
  const label = action.kind === "ship" && action.shipping ? "Shipping…" : shipLabel;
  const Icon = action.kind === "open" ? IconGitPullRequest : IconRocket;

  return (
    <ButtonGroup className="[&>[data-slot]:first-child]:rounded-l-full! [&>[data-slot]:not(:has(~[data-slot]))]:rounded-r-full!">
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant={primary ? "default" : "outline"}
              size="sm"
              className={
                primary
                  ? "rounded-full in-data-[slot=button-group]:rounded-full shadow-md"
                  : FLOATING_BUTTON
              }
              disabled={disabled}
              onClick={() => onShip()}
            />
          }
        >
          <Icon />
          {label}
        </TooltipTrigger>
        <TooltipContent>{custom ? SHIPS_BY_FILE : SHIPS_BY_DEFAULT}</TooltipContent>
      </Tooltip>
      <ShipMenu
        disabled={disabled}
        custom={custom}
        canOpenNew={canOpenNew}
        onNew={() => onShip("new")}
        onSetUp={onSetUp}
      />
    </ButtonGroup>
  );
}
