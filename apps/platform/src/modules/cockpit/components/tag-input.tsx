import { X } from "@mynaui/icons-react";
import { normalizeTag, TAG_PATTERN, TAGS_MAX } from "@aven/protocol/cockpit";
import { useState, type KeyboardEvent } from "react";

import { cn } from "cn";

import { Button } from "@/components/button";
import { Input } from "@/components/input";

import { useCockpitTags } from "../hooks/use-collection";
import { useTagColors } from "../hooks/use-tags";
import { TagBadge, tagClass, tagStyle } from "./tag-badge";

export function TagInput({
  value,
  onChange,
  label = "Tags",
  bare = false,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  label?: string;
  bare?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const known = useCockpitTags();
  const colorOf = useTagColors();
  const typed = normalizeTag(draft);
  const emptyText = bare ? "Empty" : "Add tags…";
  const offered = typed
    ? known
        .map((tag) => tag.name)
        .filter((name) => name.startsWith(typed) && !value.includes(name))
        .slice(0, 5)
    : [];

  function add(raw: string) {
    const tag = normalizeTag(raw);
    setDraft("");
    if (!TAG_PATTERN.test(tag) || value.includes(tag) || value.length >= TAGS_MAX) return;
    onChange([...value, tag]);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      if (!draft.trim()) return;
      event.preventDefault();
      add(draft);
    } else if (event.key === "Backspace" && draft === "" && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  }

  return (
    <div className="flex w-full flex-col gap-1.5">
      <div
        className={cn(
          "flex flex-wrap items-center gap-1",
          bare
            ? "min-h-8 rounded-md py-0.5 hover:bg-muted/50 focus-within:bg-muted/50"
            : "min-h-9 rounded-md border border-input px-2 py-1 focus-within:border-ring",
        )}
      >
        {value.map((tag) => (
          <TagBadge
            key={tag}
            tag={tag}
            className="gap-0 has-focus-visible:gap-0.5 has-focus-visible:pr-1 hover:gap-0.5 hover:pr-1"
          >
            {tag}
            <Button
              type="button"
              variant="ghost"
              aria-label={`Remove ${tag}`}
              className="h-3.5 w-0 min-w-0 overflow-hidden rounded-sm border-0 p-0 text-inherit opacity-0 group-hover/badge:w-3.5 group-hover/badge:opacity-70 hover:bg-transparent hover:text-inherit hover:opacity-100! focus-visible:w-3.5 focus-visible:opacity-100 pointer-coarse:w-3.5 pointer-coarse:opacity-70"
              onClick={() => onChange(value.filter((each) => each !== tag))}
            >
              <X />
            </Button>
          </TagBadge>
        ))}
        <Input
          aria-label={label}
          value={draft}
          placeholder={value.length === 0 ? emptyText : ""}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => draft.trim() && add(draft)}
          className="h-7 min-w-24 flex-1 border-0 bg-transparent px-1 shadow-none placeholder:text-muted-foreground/60 focus-visible:ring-0 dark:bg-transparent"
        />
      </div>
      {offered.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {offered.map((name) => (
            <Button
              key={name}
              type="button"
              variant="ghost"
              size="xs"
              style={tagStyle(colorOf(name))}
              className={cn(
                tagClass,
                "h-5 rounded-4xl px-2 opacity-80 hover:bg-(--tag) hover:text-(--tag-ink) hover:opacity-100",
              )}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => add(name)}
            >
              {name}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
