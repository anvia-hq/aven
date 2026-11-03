import { Plus } from "@mynaui/icons-react";
import { useState, type FormEvent } from "react";

import { cn } from "cn";

import { Button } from "@/components/button";
import { Form } from "@/components/form";
import { Input } from "@/components/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/tabs";
import { shortTimeAgo } from "@/lib/format";

import { useInbox } from "../hooks/use-inbox";
import { plainTextOf } from "../rich-text";
import type { InboxItem } from "../types";

export type InboxShown = "open" | "done";

function InboxRow({
  item,
  selected,
  onSelect,
}: {
  item: InboxItem;
  selected: boolean;
  onSelect: () => void;
}) {
  const preview = plainTextOf(item.body);
  return (
    <li>
      <Button
        variant="ghost"
        aria-current={selected ? "true" : undefined}
        onClick={onSelect}
        className={cn(
          "h-auto w-full flex-col items-stretch gap-0.5 rounded-md px-2.5 py-2 text-left font-normal whitespace-normal hover:bg-muted/60",
          selected && "bg-muted hover:bg-muted",
        )}
      >
        <span className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className={cn("size-1.5 shrink-0 rounded-full", !item.done && "bg-primary")}
          />
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-sm",
              item.done ? "text-muted-foreground" : "font-medium",
            )}
          >
            {item.title}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground/80">
            {shortTimeAgo(item.createdAt)}
          </span>
        </span>
        {(preview || item.tags.length > 0) && (
          <span className="flex min-w-0 gap-2 pl-3.5 text-xs text-muted-foreground">
            <span className="min-w-0 flex-1 truncate">{preview}</span>
            {item.tags.length > 0 && (
              <span className="shrink-0 truncate text-muted-foreground/70">
                {item.tags.map((tag) => `#${tag}`).join(" ")}
              </span>
            )}
          </span>
        )}
      </Button>
    </li>
  );
}

// The inbox's list, as a mail app's (decisions 0105 and 0106): Open or Done, a line that captures,
// and each item as a quiet row of its title, when it came and the start of its details.
export function InboxPane({
  items,
  shown,
  tag,
  selected,
  onShow,
  onSelect,
}: {
  items: InboxItem[];
  shown: InboxShown;
  tag?: string;
  selected?: string;
  onShow: (shown: InboxShown) => void;
  onSelect: (id: string) => void;
}) {
  const { capture } = useInbox();
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const listed = items.filter((item) => item.done === (shown === "done"));
  const open = items.filter((item) => !item.done).length;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      const made = await capture({ title: title.trim(), tags: tag ? [tag] : [] });
      if (made) {
        setTitle("");
        if (shown === "done") onShow("open");
        onSelect(made.id);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="flex items-center gap-2 px-4 pt-4 pb-2">
        <h1 className="flex-1 text-sm font-semibold">Inbox{tag && ` · #${tag}`}</h1>
        <Tabs value={shown} onValueChange={(value) => onShow(value === "done" ? "done" : "open")}>
          <TabsList variant="line" aria-label="Show" className="h-7">
            <TabsTrigger value="open" className="text-xs">
              Open{open > 0 && <span className="text-muted-foreground">{open}</span>}
            </TabsTrigger>
            <TabsTrigger value="done" className="text-xs">
              Done
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </header>
      <Form onSubmit={onSubmit} className="px-2 pb-1">
        <div className="flex h-9 items-center gap-2 rounded-md px-2.5 text-muted-foreground focus-within:bg-muted/60 hover:bg-muted/60">
          <Plus className="size-4 shrink-0" />
          <Input
            aria-label="Capture"
            placeholder="Capture something…"
            value={title}
            maxLength={200}
            disabled={busy}
            onChange={(event) => setTitle(event.target.value)}
            className="h-8 border-0 bg-transparent px-0 text-sm shadow-none placeholder:text-muted-foreground focus-visible:ring-0 md:text-sm dark:bg-transparent"
          />
        </div>
      </Form>
      {listed.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">
          {shown === "open"
            ? "Nothing in your inbox. Capture whatever comes to mind."
            : "Nothing done yet."}
        </p>
      ) : (
        <ul
          aria-label={shown === "open" ? "Open items" : "Done items"}
          className="flex flex-1 flex-col gap-px overflow-y-auto px-2 pb-4"
        >
          {listed.map((item) => (
            <InboxRow
              key={item.id}
              item={item}
              selected={item.id === selected}
              onSelect={() => onSelect(item.id)}
            />
          ))}
        </ul>
      )}
    </>
  );
}
