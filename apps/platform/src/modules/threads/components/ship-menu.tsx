import { IconChevronDown, IconPlus, IconSparkles } from "@tabler/icons-react";

import { Button } from "@aven/ui/button";
import { FLOATING_BUTTON } from "@/lib/floating-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@aven/ui/dropdown-menu";

type Props = {
  disabled: boolean;
  custom: boolean;
  canOpenNew: boolean;
  onNew: () => void;
  onSetUp: () => void;
};

export function ShipMenu({ disabled, custom, canOpenNew, onNew, onSetUp }: Props) {
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
        {canOpenNew && (
          <DropdownMenuItem disabled={disabled} onClick={onNew}>
            <IconPlus /> Ship as a new PR
          </DropdownMenuItem>
        )}
        <DropdownMenuItem disabled={disabled} onClick={onSetUp}>
          <IconSparkles /> {custom ? "Change how Ship works" : "Set up shipping"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
