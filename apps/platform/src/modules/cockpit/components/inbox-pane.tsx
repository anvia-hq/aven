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
import { PaneHeader } from "./split-view";

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
          "h-auto w-full flex-col items-stretch gap-0.5 rounded-none border-b px-3 py-2.5 text-left font-normal whitespace-normal",
          selected && "bg-accent",
        )}
      >
        <span className="flex items-center gap-2">
          {!item.done && (
            <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-primary" />
          )}
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-sm",
              item.done ? "text-muted-foreground" : "font-semibold",
            )}
          >
            {item.title}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {shortTimeAgo(item.createdAt)}
          </span>
        </span>
        <span className="line-clamp-2 text-xs text-muted-foreground">
          {preview || "No details"}
        </span>
        {item.tags.length > 0 && (
          <span className="truncate text-xs text-muted-foreground/80">
            {item.tags.map((tag) => `#${tag}`).join(" ")}
          </span>
        )}
      </Button>
    </li>
  );
}

// The inbox's list, as a mail app's (decision 0105): a line that captures, Open or Done, and each
// item with its title, the start of its details and when it came; the open one is highlighted.
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
    if (!title.trim()) return;
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
      <PaneHeader title="Inbox">
        <Form onSubmit={onSubmit} className="flex gap-1.5">
          <Input
            aria-label="Capture"
            placeholder="Capture something…"
            value={title}
            maxLength={200}
            onChange={(event) => setTitle(event.target.value)}
          />
          <Button type="submit" size="icon" aria-label="Capture" disabled={busy || !title.trim()}>
            <Plus />
          </Button>
        </Form>
        <Tabs value={shown} onValueChange={(value) => onShow(value === "done" ? "done" : "open")}>
          <TabsList aria-label="Show" className="w-full">
            <TabsTrigger value="open">Open{open > 0 ? ` · ${open}` : ""}</TabsTrigger>
            <TabsTrigger value="done">Done</TabsTrigger>
          </TabsList>
        </Tabs>
      </PaneHeader>
      {listed.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">
          {shown === "open"
            ? "Nothing in your inbox. Capture whatever comes to mind."
            : "Nothing done yet."}
        </p>
      ) : (
        <ul
          aria-label={shown === "open" ? "Open items" : "Done items"}
          className="flex-1 overflow-y-auto"
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
