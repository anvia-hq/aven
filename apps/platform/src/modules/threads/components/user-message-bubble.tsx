import { IconChevronDown, IconChevronUp } from "@tabler/icons-react";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { Button } from "@aven/ui/button";
import { cn } from "cn";

const MAX_LINES = 4;
const FALLBACK_LINE_HEIGHT = 24;

type Props = {
  children: ReactNode;
};

function lineHeightOf(element: HTMLElement) {
  const parsed = Number.parseFloat(getComputedStyle(element).lineHeight);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : FALLBACK_LINE_HEIGHT;
}

export function UserMessageBubble({ children }: Props) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [collapsible, setCollapsible] = useState(false);
  const [collapsedHeight, setCollapsedHeight] = useState(MAX_LINES * FALLBACK_LINE_HEIGHT);

  useLayoutEffect(() => {
    const element = contentRef.current;

    if (!element) return;

    const measure = () => {
      const limit = Math.ceil(lineHeightOf(element) * MAX_LINES);
      setCollapsedHeight(limit);
      setCollapsible(element.scrollHeight > limit + 4);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [children]);

  const collapsed = collapsible && !expanded;

  return (
    <div
      className={cn(
        "w-fit max-w-full rounded-2xl border border-foreground/6 bg-linear-to-r from-(--user-bubble-from) to-(--user-bubble-to) bg-clip-padding px-4 py-2.5 dark:border-foreground/10 [&_p]:whitespace-pre-line",
        collapsed && "cursor-pointer",
      )}
      onClick={(event) => {
        if (!collapsed) return;

        if ((event.target as HTMLElement).closest("a, button")) return;

        if (window.getSelection()?.toString()) return;

        setExpanded(true);
      }}
    >
      <div
        ref={contentRef}
        style={collapsed ? { maxHeight: `${collapsedHeight}px` } : undefined}
        className={cn(
          collapsed &&
            "overflow-hidden [mask-image:linear-gradient(to_bottom,black_55%,transparent_100%)]",
        )}
      >
        {children}
      </div>
      {collapsible && (
        <div className="mt-1 flex justify-end">
          <Button
            variant="ghost"
            size="xs"
            aria-expanded={expanded}
            onClick={() => setExpanded((current) => !current)}
            className="h-6 gap-1 px-1.5 text-xs text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
          >
            {expanded ? (
              <>
                Show less
                <IconChevronUp className="size-3.5" />
              </>
            ) : (
              <>
                Show more
                <IconChevronDown className="size-3.5" />
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
