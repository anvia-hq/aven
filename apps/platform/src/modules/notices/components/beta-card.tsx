import { X } from "@mynaui/icons-react";

import { Button } from "@/components/button";

import { useNotice } from "../hooks/use-notice";

export function BetaCard() {
  const { visible, dismiss } = useNotice("beta");

  if (!visible) return null;

  return (
    <section
      aria-label="Beta notice"
      className="flex flex-col gap-1 rounded-2xl bg-muted/60 p-1 group-data-[collapsible=icon]:hidden"
    >
      <div className="flex items-center justify-between gap-2 rounded-xl bg-background px-3 py-2 ring-1 ring-foreground/5">
        <span className="font-mono text-xs font-medium tracking-wide uppercase">Beta</span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Dismiss"
          className="size-6"
          onClick={dismiss}
        >
          <X className="size-3.5" />
        </Button>
      </div>
      <p className="rounded-xl bg-background px-3 py-2 text-xs leading-relaxed text-muted-foreground ring-1 ring-foreground/5">
        Aven is in beta. Things change often and some parts are rough. Tell us what breaks.
      </p>
    </section>
  );
}
