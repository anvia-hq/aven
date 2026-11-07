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
          <DropdownMenuRadioItem value="private" closeOnClick>
            <Lock />
            <span className="flex flex-col">
              Only me
              <span className="text-xs text-muted-foreground">Nobody else can see it.</span>
            </span>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="workspace" closeOnClick>
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
