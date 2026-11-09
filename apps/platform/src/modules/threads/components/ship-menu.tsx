import { ChevronDown, Plus } from "@mynaui/icons-react";

import { Button } from "@/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/dropdown-menu";

type Props = { disabled: boolean; onNew: () => void };

export function ShipMenu({ disabled, onNew }: Props) {
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
      <DropdownMenuContent align="end">
        <DropdownMenuItem disabled={disabled} onClick={onNew}>
          <Plus /> Ship as a new PR
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
