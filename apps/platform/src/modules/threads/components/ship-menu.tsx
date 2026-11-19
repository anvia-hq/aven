import { IconChevronDown, IconPlus } from "@tabler/icons-react";

import { Button } from "@aven/ui/button";
import { FLOATING_BUTTON } from "@/lib/floating-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@aven/ui/dropdown-menu";

type Props = { disabled: boolean; onNew: () => void };

export function ShipMenu({ disabled, onNew }: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            size="icon-sm"
            className={FLOATING_BUTTON}
            aria-label="More ways to ship"
          />
        }
      >
        <IconChevronDown />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem disabled={disabled} onClick={onNew}>
          <IconPlus /> Ship as a new PR
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
