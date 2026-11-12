import { useEffect, useState, type KeyboardEvent, type PointerEvent } from "react";

import { useLocalStorage } from "@/hooks/use-local-storage";

const STORAGE_KEY = "aven.sidebar-width";
const DEFAULT_WIDTH = 240;
const MIN_WIDTH = 192;
const MAX_WIDTH = 448;
const KEY_STEP = 16;
const RAIL_WIDTH = 56;

const clamp = (width: number) => Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width));

export function useSidebarWidth() {
  const [saved, setWidth] = useLocalStorage(STORAGE_KEY, DEFAULT_WIDTH);
  const width = clamp(Number(saved) || DEFAULT_WIDTH);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    document.body.toggleAttribute("data-resizing-sidebar", dragging);
    return () => document.body.removeAttribute("data-resizing-sidebar");
  }, [dragging]);

  const handlers = {
    onPointerDown(event: PointerEvent<HTMLElement>) {
      event.currentTarget.setPointerCapture(event.pointerId);
      setDragging(true);
    },
    onPointerMove(event: PointerEvent<HTMLElement>) {
      if (dragging) setWidth(clamp(event.clientX - RAIL_WIDTH));
    },
    onPointerUp: () => setDragging(false),
    onPointerCancel: () => setDragging(false),
    onKeyDown(event: KeyboardEvent<HTMLElement>) {
      if (event.key === "ArrowLeft") setWidth((current) => clamp(current - KEY_STEP));

      if (event.key === "ArrowRight") setWidth((current) => clamp(current + KEY_STEP));
    },
  };

  return { width, min: MIN_WIDTH, max: MAX_WIDTH, handlers };
}
