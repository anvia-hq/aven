import type { DragEvent } from "react";

export const THREAD_DRAG = "application/x-aven-thread";

export const dragThread = (event: DragEvent, id: string) => {
  event.dataTransfer.setData(THREAD_DRAG, id);
  event.dataTransfer.effectAllowed = "move";
};

export const dragsThread = (event: DragEvent) => event.dataTransfer.types.includes(THREAD_DRAG);
