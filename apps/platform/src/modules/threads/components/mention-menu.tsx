import {
  ComposerPrimitive,
  type ComposerTriggerItem,
  type ComposerTriggerState,
} from "@anvia/react-ui/chat";
import { useEffect, useRef, type ReactNode } from "react";

const NOTHING_MATCHES: Record<string, string> = {
  file: "No file matches",
  skill: "No skill matches",
  bot: "No bot or thread matches",
};

function emptyMenu({ loading, trigger }: ComposerTriggerState) {
  if (loading) return "Searching…";

  return NOTHING_MATCHES[trigger.id] ?? "Nothing matches";
}

function MentionOption({
  item,
  index,
  selected,
  icon,
}: {
  item: ComposerTriggerItem;
  index: number;
  selected: boolean;
  icon?: (item: ComposerTriggerItem) => ReactNode;
}) {
  const label = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (selected) label.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);
  return (
    <ComposerPrimitive.TriggerItem
      index={index}
      className="flex min-w-0 shrink-0 items-baseline gap-2 rounded-md px-2 py-1.5 text-left data-[state=selected]:bg-accent data-[state=selected]:text-accent-foreground"
    >
      {icon?.(item) ? <span className="flex shrink-0 self-center">{icon(item)}</span> : null}
      <span ref={label} className="shrink-0 font-mono">
        {item.label}
      </span>
      {item.detail ? (
        <span className="min-w-0 truncate text-xs text-muted-foreground">{item.detail}</span>
      ) : null}
    </ComposerPrimitive.TriggerItem>
  );
}

export function MentionMenu({ icon }: { icon?: (item: ComposerTriggerItem) => ReactNode }) {
  return (
    <ComposerPrimitive.TriggerMenu
      aria-label="Mention"
      className="absolute inset-x-0 bottom-full z-20 mb-1 flex max-h-72 flex-col overflow-y-auto rounded-lg border bg-popover p-1 text-sm text-popover-foreground shadow-md"
      style={{ position: "absolute", top: "auto", left: 0 }}
    >
      {(trigger) =>
        trigger.items.length === 0 ? (
          <p className="px-2 py-1.5 text-muted-foreground">{emptyMenu(trigger)}</p>
        ) : (
          trigger.items.map((item, index) => (
            <MentionOption
              key={item.id}
              item={item}
              index={index}
              selected={index === trigger.selectedIndex}
              icon={icon}
            />
          ))
        )
      }
    </ComposerPrimitive.TriggerMenu>
  );
}
