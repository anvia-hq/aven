import { X } from "@mynaui/icons-react";

import { Button } from "@/components/button";

import { useNotice } from "../hooks/use-notice";

export function BetaCard() {
  const { visible, dismiss } = useNotice("beta");

  if (!visible) return null;

  return (
    <section
      aria-label="Beta notice"
      style={{ backgroundImage: "url(/beta-waves.jpg)" }}
      className="relative flex flex-col gap-1 overflow-hidden rounded-xl bg-cover bg-center p-3 text-white [text-shadow:0_1px_3px_rgb(0_0_0/0.55)] ring-1 ring-foreground/10 group-data-[collapsible=icon]:hidden"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-sm font-semibold tracking-wide uppercase">Beta</span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Dismiss"
          className="-mt-1 -mr-1 size-6 text-white/80 hover:bg-white/15 hover:text-white"
          onClick={dismiss}
        >
          <X className="size-3.5" />
        </Button>
      </div>
      <p className="text-xs leading-snug text-white/85">
        Things change often and some parts are rough.
      </p>
    </section>
  );
}
