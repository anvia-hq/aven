import { ArrowUp } from "@mynaui/icons-react";
import type { CSSProperties } from "react";

import { Button } from "@/components/button";

type Props = { suggestions: string[]; onPick: (text: string) => void };

export function FollowUpChips({ suggestions, onPick }: Props) {
  if (suggestions.length === 0) return null;
  return (
    <ul
      aria-label="Suggested replies"
      data-slot="follow-ups"
      className="mb-2 flex min-w-0 gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none]"
    >
      {suggestions.map((text, index) => (
        <li
          key={text}
          style={{ transitionDelay: `${index * 40}ms` } as CSSProperties}
          className="min-w-0 shrink-0 transition-[opacity] duration-200 ease-out starting:opacity-0 motion-reduce:transition-none"
        >
          <Button
            variant="ghost"
            onClick={() => onPick(text)}
            className="h-auto flex max-w-[min(20rem,80vw)] items-center gap-2 rounded-full border bg-card py-1.5 pr-4 pl-1.5 text-left text-sm transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
              <ArrowUp className="size-4" />
            </span>
            <span className="truncate">{text}</span>
          </Button>
        </li>
      ))}
    </ul>
  );
}
