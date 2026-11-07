import { ChevronDown, Plus } from "@mynaui/icons-react";

import { Button } from "@/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/dropdown-menu";

import type { ThreadPullRequest } from "../types";

type Props = {
  pullRequests: ThreadPullRequest[];
  canUpdate: boolean;
  disabled: boolean;
  onNew: () => void;
};

export function ShipMenu({ pullRequests, canUpdate, disabled, onNew }: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            size="icon-sm"
            className="shadow-md"
            aria-label="More ways to ship"
          />
        }
      >
        <ChevronDown />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        {canUpdate && (
          <>
            <DropdownMenuItem disabled={disabled} onClick={onNew}>
              <Plus /> Ship as a new PR
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuGroup>
          <DropdownMenuLabel>Pull requests</DropdownMenuLabel>
          {pullRequests.map((pull) => (
            <DropdownMenuItem
              key={pull.number}
              render={<a href={pull.url} target="_blank" rel="noreferrer" />}
            >
              <span className="shrink-0 text-muted-foreground">#{pull.number}</span>
              <span className="min-w-0 flex-1 truncate">{pull.title}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{pull.state}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
