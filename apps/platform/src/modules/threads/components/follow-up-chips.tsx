import { ArrowUp } from "@mynaui/icons-react";
import { useRef, type CSSProperties } from "react";

import { Button } from "@aven/ui/button";

import { useFullyVisible } from "../hooks/use-fully-visible";

type Props = { suggestions: string[]; onPick: (text: string) => void };

export function FollowUpChips({ suggestions, onPick }: Props) {
  const list = useRef<HTMLUListElement>(null);
  const hidden = useFullyVisible(list, suggestions.join("\n"));

  if (suggestions.length === 0) return null;

  return (
    <ul
      ref={list}
      aria-label="Suggested replies"
      data-slot="follow-ups"
      className="flex h-9 min-w-0 flex-1 flex-wrap gap-2 overflow-hidden p-1"
    >
      {suggestions.map((text, index) => (
        <li
          key={text}
          inert={hidden.has(index)}
          style={{ transitionDelay: `${index * 40}ms` } as CSSProperties}
          className="max-w-[16rem] min-w-0 transition-[opacity] duration-200 ease-out starting:opacity-0 motion-reduce:transition-none"
        >
          <Button
            variant="outline"
            size="sm"
            className="max-w-full gap-1.5 pr-2.5 pl-1.5 shadow-md"
            onClick={() => onPick(text)}
          >
            <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
              <ArrowUp className="size-3" />
            </span>
            <span className="truncate">{text}</span>
          </Button>
        </li>
      ))}
    </ul>
  );
}
