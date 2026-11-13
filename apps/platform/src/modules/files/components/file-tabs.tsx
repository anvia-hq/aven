import { X } from "@mynaui/icons-react";
import { cn } from "cn";
import { useEffect, useRef } from "react";

import { Button } from "@/components/button";

import { baseName } from "../paths";

type Props = {
  open: string[];
  active: string | null;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
};

export function FileTabs({ open, active, onSelect, onClose }: Props) {
  const strip = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const tabs = Array.from(strip.current?.children ?? []);
    const tab = tabs.find((child) => child instanceof HTMLElement && child.dataset.path === active);
    tab?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active, open.length]);

  if (open.length === 0) return null;

  return (
    <div
      ref={strip}
      onWheel={(event) => {
        if (event.deltaY !== 0 && strip.current) strip.current.scrollLeft += event.deltaY;
      }}
      className="no-scrollbar flex h-9 shrink-0 items-stretch overflow-x-auto border-b"
    >
      {open.map((path) => {
        const name = baseName(path);
        const shared = open.filter((other) => baseName(other) === name).length > 1;
        const current = active === path;
        return (
          <div
            key={path}
            data-path={path}
            className={cn(
              "group relative flex max-w-56 shrink-0 items-center border-r pr-1 pl-3 text-xs",
              current
                ? "bg-background text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-foreground"
                : "bg-muted/30 text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            <Button
              variant="ghost"
              size="xs"
              title={path}
              aria-current={current || undefined}
              onClick={() => onSelect(path)}
              className="h-full min-w-0 justify-start rounded-none px-0 pr-2 font-normal hover:bg-transparent"
            >
              <span className="truncate">{shared ? path : name}</span>
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
