import { X } from "@mynaui/icons-react";
import { cn } from "cn";

import { Button } from "@/components/button";

import { baseName } from "../paths";

type Props = {
  open: string[];
  active: string | null;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
};

export function FileTabs({ open, active, onSelect, onClose }: Props) {
  return (
    <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
      {open.map((path) => {
        const name = baseName(path);
        const shared = open.filter((other) => baseName(other) === name).length > 1;
        return (
          <div
            key={path}
            className={cn(
              "flex shrink-0 items-center rounded-md text-xs",
              active === path ? "bg-muted" : "hover:bg-muted/50",
            )}
          >
            <Button
              variant="ghost"
              size="xs"
              className="font-normal hover:bg-transparent"
              title={path}
              onClick={() => onSelect(path)}
            >
              {shared ? path : name}
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`Close ${path}`}
              onClick={() => onClose(path)}
            >
              <X />
            </Button>
          </div>
        );
      })}
    </div>
  );
}
