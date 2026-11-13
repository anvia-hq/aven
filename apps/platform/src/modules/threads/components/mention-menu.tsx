import {
  ComposerPrimitive,
  type ComposerTriggerItem,
  type ComposerTriggerState,
} from "@anvia/react-ui/chat";
import { Command, File } from "@mynaui/icons-react";
import { cn } from "cn";
import { useEffect, useRef, type ReactNode } from "react";

const NOTHING_MATCHES: Record<string, string> = {
  file: "No file matches",
  skill: "No skill matches",
  bot: "No bot or thread matches",
};

const HEADINGS: Record<string, string> = {
  file: "Files",
  skill: "Skills",
  bot: "Bots and threads",
};

const FALLBACK_ICONS: Record<string, ReactNode> = {
  file: <File />,
  skill: <Command />,
};

function splitPath(path: string) {
  const at = path.lastIndexOf("/");
  return at === -1
    ? { name: path, folder: "" }
    : { name: path.slice(at + 1), folder: path.slice(0, at) };
}

function emptyMenu({ loading, trigger }: ComposerTriggerState) {
  if (loading) return "Searching…";

  return NOTHING_MATCHES[trigger.id] ?? "Nothing matches";
}

function MentionOption({
  item,
  index,
  selected,
  kind,
  icon,
}: {
  item: ComposerTriggerItem;
  index: number;
  selected: boolean;
  kind: string;
  icon?: (item: ComposerTriggerItem) => ReactNode;
}) {
  const label = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (selected) label.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);
  const given = icon?.(item);
  const file = kind === "file" ? splitPath(item.label) : null;
  const fallback = FALLBACK_ICONS[kind] ?? null;
  return (
    <ComposerPrimitive.TriggerItem
      index={index}
      aria-label={item.label}
      className="flex min-w-0 shrink-0 items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left outline-none data-[state=selected]:bg-accent data-[state=selected]:text-accent-foreground"
    >
      {given || fallback ? (
        <span className="flex size-5 shrink-0 items-center justify-center text-muted-foreground [&_svg]:size-4">
          {given ?? fallback}
        </span>
      ) : null}
      <span ref={label} className={cn("shrink-0 text-sm", file && "font-mono text-[13px]")}>
        {file ? file.name : item.label}
      </span>
      {file?.folder ? (
        <span className="min-w-0 truncate text-xs text-muted-foreground">{file.folder}</span>
      ) : null}
      {!file && item.detail ? (
        <span className="min-w-0 truncate text-xs text-muted-foreground">{item.detail}</span>
      ) : null}
    </ComposerPrimitive.TriggerItem>
  );
}

export function MentionMenu({ icon }: { icon?: (item: ComposerTriggerItem) => ReactNode }) {
  return (
    <ComposerPrimitive.TriggerMenu
      aria-label="Mention"
      className="absolute inset-x-0 bottom-full z-20 mb-2 flex max-h-80 flex-col overflow-hidden rounded-xl border bg-popover/95 text-sm text-popover-foreground shadow-lg ring-1 ring-foreground/5 backdrop-blur-md"
      style={{ position: "absolute", top: "auto", left: 0 }}
    >
      {(trigger) => (
        <>
          <p className="shrink-0 px-3.5 pt-2.5 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            {HEADINGS[trigger.trigger.id] ?? "Mention"}
          </p>
          <div className="no-scrollbar flex min-h-0 flex-col overflow-y-auto p-1.5 pt-0.5">
            {trigger.items.length === 0 ? (
              <p className="px-2.5 py-2 text-muted-foreground">{emptyMenu(trigger)}</p>
            ) : (
              trigger.items.map((item, index) => (
                <MentionOption
                  key={item.id}
                  item={item}
                  index={index}
                  selected={index === trigger.selectedIndex}
                  kind={trigger.trigger.id}
                  icon={icon}
                />
              ))
            )}
          </div>
          <p className="flex shrink-0 items-center gap-3 border-t px-3.5 py-1.5 text-[11px] text-muted-foreground">
            <span>↑↓ move</span>
            <span>↵ pick</span>
            <span>esc close</span>
          </p>
        </>
      )}
    </ComposerPrimitive.TriggerMenu>
  );
}
