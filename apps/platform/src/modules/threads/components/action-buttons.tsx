import { ChevronDown, Play } from "@mynaui/icons-react";

import { Button } from "@/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/tooltip";
import type { ThreadAction } from "@aven/protocol/types";

import { useThreadActions } from "../hooks/use-thread-actions";
import type { Thread } from "../types";

const BUTTONS = 2;

export function ActionButtons({ thread }: { thread: Thread }) {
  const { actions, problem, starting, start } = useThreadActions(thread.id, thread.running);
  if (problem) {
    return (
      <Tooltip>
        <TooltipTrigger render={<span tabIndex={0} className="text-xs text-destructive" />}>
          .aven/actions.yml has a problem
        </TooltipTrigger>
        <TooltipContent>{problem}</TooltipContent>
      </Tooltip>
    );
  }
  if (actions.length === 0) return null;
  const disabled = (action: ThreadAction) =>
    starting !== null || (action.kind === "prompt" && thread.running);
  const rest = actions.slice(BUTTONS);

  return (
    <>
      {actions.slice(0, BUTTONS).map((action) => (
        <Button
          key={action.name}
          variant="outline"
          size="sm"
          className="shadow-md"
          disabled={disabled(action)}
          onClick={() => void start(action)}
        >
          <Play />
          {starting === action.name ? `${action.name}…` : action.name}
        </Button>
      ))}
      {rest.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="outline"
                size="icon-sm"
                className="shadow-md"
                aria-label="More actions"
              />
            }
          >
            <ChevronDown />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {rest.map((action) => (
              <DropdownMenuItem
                key={action.name}
                disabled={disabled(action)}
                onClick={() => void start(action)}
              >
                <Play /> {action.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </>
  );
}
