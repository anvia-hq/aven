import { IconChevronDown, IconChevronUp } from "@tabler/icons-react";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { Button } from "@aven/ui/button";
import { cn } from "cn";

const MAX_LINES = 4;
const FALLBACK_LINE_HEIGHT = 24;
const COLLAPSED_FADE_PAD = 16;

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
        "relative w-fit max-w-full rounded-2xl border border-foreground/6 bg-linear-to-r from-(--user-bubble-from) to-(--user-bubble-to) bg-clip-padding px-4 py-2.5 dark:border-foreground/10 [&_p]:whitespace-pre-line",
        collapsible && "min-w-32",
        collapsed && "cursor-pointer overflow-hidden",
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
        style={collapsed ? { maxHeight: `${collapsedHeight + COLLAPSED_FADE_PAD}px` } : undefined}
        className={cn(collapsed && "overflow-hidden")}
      >
        {children}
      </div>
      {collapsed && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-18 bg-linear-to-r from-(--user-bubble-from) to-(--user-bubble-to) [mask-image:linear-gradient(to_bottom,transparent_0%,rgb(0_0_0/0.55)_45%,black_78%,black_100%)]"
        />
      )}
      {collapsible && (
        <div
          className={cn(
            "flex justify-end",
            collapsed ? "absolute inset-x-0 bottom-0 px-3 pb-1.5" : "mt-1",
          )}
        >
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
