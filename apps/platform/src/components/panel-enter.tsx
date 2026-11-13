import type { ReactNode } from "react";

import { cn } from "cn";

export const PANEL_EXIT_MS = 150;

export function PanelEnter({
  children,
  leaving = false,
}: {
  children: ReactNode;
  leaving?: boolean;
}) {
  return (
    <div
      aria-hidden={leaving || undefined}
      inert={leaving}
      className={cn(
        "h-full min-h-0",
        leaving
          ? "motion-safe:animate-out motion-safe:duration-150 motion-safe:ease-in motion-safe:fade-out motion-safe:slide-out-to-right-4 motion-safe:fill-mode-forwards"
          : "motion-safe:animate-in motion-safe:duration-200 motion-safe:ease-out motion-safe:fade-in motion-safe:slide-in-from-right-4",
      )}
    >
      {children}
    </div>
  );
}
