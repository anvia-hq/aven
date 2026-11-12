import { cn } from "cn";
import { useState, type ReactNode } from "react";

import { dragsThread, THREAD_DRAG } from "@/modules/threads/split";

type Props = {
  dragging: boolean;
  onDropThread: (threadId: string) => void;
  children: ReactNode;
};

export function UnfiledArea({ dragging, onDropThread, children }: Props) {
  const [over, setOver] = useState(false);
  return (
    <div
      data-slot="unfiled"
      data-over={over}
      className={cn(
        "rounded-lg",
        over &&
          "bg-primary/10 outline-[1.5px] -outline-offset-[1.5px] outline-primary outline-dashed",
      )}
      onDragOver={(event) => {
        if (!dragsThread(event)) return;

        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={(event) => {
        if (!dragsThread(event)) return;

        event.preventDefault();
        event.stopPropagation();
        setOver(false);
        onDropThread(event.dataTransfer.getData(THREAD_DRAG));
      }}
    >
      {children}
      {dragging && (
        <div className="my-1 flex h-8 items-center justify-center rounded-lg border-[1.5px] border-dashed border-primary text-xs text-primary">
          Drop here to unfile
        </div>
      )}
    </div>
  );
}
