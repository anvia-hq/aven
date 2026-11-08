import { Play, Star, StarSolid } from "@mynaui/icons-react";
import { useState } from "react";

import { Button } from "@/components/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/tooltip";
import type { ThreadAction } from "@aven/protocol/types";

import { useThreadActions } from "../hooks/use-thread-actions";
import type { Thread } from "../types";

export function ActionButtons({ thread }: { thread: Thread }) {
  const { actions, problem, starting, start, favorites, toggleFavorite } = useThreadActions(
    thread.id,
    thread.projectId,
    thread.running,
  );
  const [open, setOpen] = useState(false);
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
  const pinned = actions.filter((action) => favorites.includes(action.name));

  return (
    <>
      {pinned.map((action) => (
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
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger render={<Button variant="outline" size="sm" className="shadow-md" />}>
          <Play />
          Actions
        </PopoverTrigger>
        <PopoverContent align="end" side="top" className="w-64 gap-0.5 p-1.5">
          {actions.map((action) => {
            const favorite = favorites.includes(action.name);
            return (
              <div key={action.name} className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="min-w-0 flex-1 justify-start"
                  disabled={disabled(action)}
                  onClick={() => {
                    setOpen(false);
                    void start(action);
                  }}
                >
                  <Play />
                  <span className="truncate">{action.name}</span>
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-pressed={favorite}
                  aria-label={
                    favorite
                      ? `Remove ${action.name} from the buttons`
                      : `Show ${action.name} as a button`
                  }
                  onClick={() => toggleFavorite(action.name)}
                >
                  {favorite ? <StarSolid className="text-primary" /> : <Star />}
                </Button>
              </div>
            );
          })}
        </PopoverContent>
      </Popover>
    </>
  );
}
