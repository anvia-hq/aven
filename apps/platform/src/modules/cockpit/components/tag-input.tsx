import { X } from "@mynaui/icons-react";
import { normalizeTag, TAG_PATTERN, TAGS_MAX } from "@aven/protocol/cockpit";
import { useState, type KeyboardEvent } from "react";

import { Badge } from "@/components/badge";
import { Button } from "@/components/button";
import { Input } from "@/components/input";

import { useCockpitTags } from "../hooks/use-collection";

// The tags of a record as chips, and a field that adds one on Enter or a comma and takes the last
// away on Backspace. The tags the person already uses are offered as they type.
export function TagInput({
  value,
  onChange,
  label = "Tags",
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  label?: string;
}) {
  const [draft, setDraft] = useState("");
  const known = useCockpitTags();
  const typed = normalizeTag(draft);
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
    <div className="flex flex-col gap-1.5">
      <div className="flex min-h-9 flex-wrap items-center gap-1 rounded-md border border-input px-2 py-1 focus-within:border-ring">
        {value.map((tag) => (
          <Badge key={tag} variant="secondary" className="gap-0.5 pr-1">
            #{tag}
            <Button
              type="button"
              variant="ghost"
              aria-label={`Remove ${tag}`}
              className="size-3.5 rounded-sm p-0 hover:bg-transparent hover:text-foreground"
              onClick={() => onChange(value.filter((each) => each !== tag))}
            >
              <X />
            </Button>
          </Badge>
        ))}
        <Input
          aria-label={label}
          value={draft}
          placeholder={value.length === 0 ? "Add tags…" : ""}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => draft.trim() && add(draft)}
          className="h-7 min-w-24 flex-1 border-0 px-1 shadow-none focus-visible:ring-0 dark:bg-transparent"
        />
      </div>
      {offered.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {offered.map((name) => (
            <Badge
              key={name}
              variant="outline"
              render={
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onMouseDown={(event) => event.preventDefault()}
                />
              }
              onClick={() => add(name)}
            >
              #{name}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
