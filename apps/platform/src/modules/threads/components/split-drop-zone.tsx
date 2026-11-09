import { useNavigate } from "@tanstack/react-router";
import { useState, type DragEvent, type ReactNode } from "react";

import { cn } from "cn";

import { dragsThread, sideOf, splitWith, THREAD_DRAG } from "../split";
import type { SplitSide } from "../types";

type Props = { threadId: string; split?: string; enabled: boolean; children: ReactNode };

export function SplitDropZone({ threadId, split, enabled, children }: Props) {
  const navigate = useNavigate();
  const [over, setOver] = useState<SplitSide | null>(null);

  const aim = (event: DragEvent<HTMLDivElement>) => {
    if (!enabled || !dragsThread(event)) return null;
    const box = event.currentTarget.getBoundingClientRect();
    return sideOf(event.clientX, box.left, box.width);
  };

  return (
    <div
      data-slot="split-drop-zone"
      className="relative min-w-0"
      onDragOver={(event) => {
        const side = aim(event);
        if (!side) return;
        event.preventDefault();
        setOver(side);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(null);
      }}
      onDrop={(event) => {
        const side = aim(event);
        setOver(null);
        if (!side) return;
        event.preventDefault();
        const next = splitWith(event.dataTransfer.getData(THREAD_DRAG), side, threadId, split);
        if (!next) return;
        void navigate({
          to: "/threads/$threadId",
          params: { threadId: next.threadId },
          search: { split: next.split },
        });
      }}
    >
      {children}
      {over && (
        <div
          aria-hidden
          data-drop={over}
          className={cn(
            "pointer-events-none absolute inset-y-0 z-50 w-1/2 rounded-xl border-2 border-primary bg-primary/10",
            over === "left" ? "left-0" : "right-0",
          )}
        />
      )}
    </div>
  );
}
