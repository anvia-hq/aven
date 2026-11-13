import { cn } from "cn";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@aven/ui/collapsible";

function BrainIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M9.5 2.8a2.6 2.6 0 0 0-2.6 2.6v.1a2.9 2.9 0 0 0-2.4 2.9c0 .6.2 1.1.5 1.6a2.9 2.9 0 0 0-.5 1.6 2.9 2.9 0 0 0 2.4 2.9 2.6 2.6 0 0 0 2.6 2.4c1.4 0 2.5-1.1 2.5-2.5V5.3c0-1.4-1.1-2.5-2.5-2.5Z" />
      <path d="M14.5 2.8a2.6 2.6 0 0 1 2.6 2.6v.1a2.9 2.9 0 0 1 2.4 2.9c0 .6-.2 1.1-.5 1.6.3.5.5 1 .5 1.6a2.9 2.9 0 0 1-2.4 2.9 2.6 2.6 0 0 1-2.6 2.4c-1.4 0-2.5-1.1-2.5-2.5V5.3c0-1.4 1.1-2.5 2.5-2.5Z" />
    </svg>
  );
}

export function ReasoningBlock({ text, thinking = false }: { text: string; thinking?: boolean }) {
  return (
    <Collapsible className="min-w-0 text-sm" defaultOpen={false}>
      <CollapsibleTrigger className="group -mx-2 flex w-[calc(100%+1rem)] items-center gap-2 rounded-md px-2 py-1 text-left hover:bg-muted/50">
        <BrainIcon className="size-4 shrink-0 text-muted-foreground" />
        <span className={cn("text-muted-foreground", thinking && "shimmer")}>
          {thinking ? "Thinking" : "Thoughts"}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <p className="whitespace-pre-wrap px-2 pb-2 text-muted-foreground/80">{text}</p>
      </CollapsibleContent>
    </Collapsible>
  );
}
