import type { ReactNode } from "react";

export function PanelEnter({ children }: { children: ReactNode }) {
  return (
    <div className="h-full min-h-0 motion-safe:animate-in motion-safe:duration-200 motion-safe:ease-out motion-safe:fade-in motion-safe:slide-in-from-right-4">
      {children}
    </div>
  );
}
