import type { ReactNode } from "react";

// A short message centred in a panel, in place of what the panel would show.
export function PanelNotice({ children }: { children: ReactNode }) {
  return (
    <div className="flex size-full items-center justify-center p-8 text-center text-sm text-muted-foreground">
      <p className="max-w-sm">{children}</p>
    </div>
  );
}
