import { AltArrowDownIcon, AddIcon } from "@solar-icons/react/linear";

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
        <AltArrowDownIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem disabled={disabled} onClick={onNew}>
          <AddIcon /> Ship as a new PR
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
