import { ChevronDown, Globe, Lock } from "@mynaui/icons-react";

import { Button } from "@/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/dropdown-menu";

import { useShareThread } from "../hooks/use-share-thread";
import type { Thread, ThreadVisibility } from "../types";

// In the header of a thread the person made: who can see it. Shared with the workspace, every
// member can read the conversation, its files and its changes, and nothing more (decision 0084).
export function ThreadShare({ thread }: { thread: Thread }) {
  const share = useShareThread();
  const shared = thread.visibility === "workspace";
  const Icon = shared ? Globe : Lock;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="outline" size="sm" aria-label="Who can see this thread" />}
      >
        <Icon />
        {shared ? "Shared" : "Private"}
        <ChevronDown />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuRadioGroup
          value={thread.visibility}
          onValueChange={(value) => void share(thread, value as ThreadVisibility)}
        >
          <DropdownMenuRadioItem value="private">
            <Lock />
            <span className="flex flex-col">
              Only me
              <span className="text-xs text-muted-foreground">Nobody else can see it.</span>
            </span>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="workspace">
            <Globe />
            <span className="flex flex-col">
              Everyone in the workspace
              <span className="text-xs text-muted-foreground">
                They can read it, not change it.
              </span>
            </span>
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
