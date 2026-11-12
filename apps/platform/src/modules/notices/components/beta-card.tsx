import { X } from "@mynaui/icons-react";
import { useId } from "react";

import { Button } from "@/components/button";

import { useNotice } from "../hooks/use-notice";

function Waves({ id }: { id: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 240 160"
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0 size-full"
    >
      <defs>
        <filter id={id} x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.012 0.02" numOctaves="2" seed="7" />
          <feDisplacementMap in="SourceGraphic" scale="90" />
          <feGaussianBlur stdDeviation="7" />
        </filter>
        <linearGradient id={`${id}-a`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2dd4bf" />
          <stop offset="1" stopColor="#0ea5e9" />
        </linearGradient>
        <linearGradient id={`${id}-b`} x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fb923c" />
          <stop offset="1" stopColor="#e11d48" />
        </linearGradient>
      </defs>
      <rect width="240" height="160" fill="#04100f" />
      <g filter={`url(#${id})`}>
        <ellipse cx="60" cy="40" rx="110" ry="34" fill={`url(#${id}-a)`} />
        <ellipse cx="190" cy="120" rx="100" ry="30" fill={`url(#${id}-b)`} />
        <ellipse cx="120" cy="80" rx="90" ry="14" fill="#04100f" />
      </g>
    </svg>
  );
}

export function BetaCard() {
  const { visible, dismiss } = useNotice("beta");
  const id = useId().replaceAll(":", "");

  if (!visible) return null;

  return (
    <section
      aria-label="Beta notice"
      className="relative isolate flex min-h-36 flex-col justify-between overflow-hidden rounded-2xl p-3 text-white ring-1 ring-foreground/10 group-data-[collapsible=icon]:hidden"
    >
      <Waves id={id} />
      <div className="relative flex items-start justify-between gap-2">
        <span className="font-mono text-[10px] tracking-widest uppercase opacity-80">
          Early access
        </span>
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
      <div className="relative flex flex-col gap-1">
        <span className="font-mono text-3xl leading-none font-semibold tracking-tight">Beta</span>
        <p className="text-xs leading-snug text-white/80">
          Things change often and some parts are rough. Tell us what breaks.
        </p>
      </div>
    </section>
  );
}
