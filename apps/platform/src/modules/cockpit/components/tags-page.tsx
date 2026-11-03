import { Check, Tag } from "@mynaui/icons-react";
import { normalizeTag, TAG_PATTERN } from "@aven/protocol/cockpit";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/button";
import { Form } from "@/components/form";
import { Input } from "@/components/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/popover";
import { colors, paletteColor } from "@/modules/bots/avatar";

import { useTagColors, useTags } from "../hooks/use-tags";
import type { CockpitTag } from "../types";
import { TagBadge, tagStyle } from "./tag-badge";

// The palette's colors by name, in its order, for the picker to say.
const COLOR_NAMES = [
  "Pink",
  "Rose",
  "Violet",
  "Purple",
  "Sky",
  "Blue",
  "Green",
  "Mint",
  "Red",
  "Orange",
  "Amber",
  "Yellow",
];

// What carries a tag, in a few words.
function usedBy(tag: CockpitTag) {
  const parts = [
    [tag.inbox, "inbox item", "inbox items"],
    [tag.tasks, "task", "tasks"],
    [tag.notes, "note", "notes"],
  ] as const;
  const used = parts.filter(([n]) => n > 0).map(([n, one, many]) => `${n} ${n === 1 ? one : many}`);
  return used.length > 0 ? used.join(" · ") : "Not used yet";
}

// A tag's color, picked from the bots' palette or given back to the one its name picks.
function ColorPicker({ tag }: { tag: CockpitTag }) {
  const { setColor } = useTags();
  const colorOf = useTagColors();
  const [open, setOpen] = useState(false);
  const current = colorOf(tag.name);
  const pick = (color: string | null) => {
    setOpen(false);
    void setColor(tag.name, color);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<Button variant="ghost" size="icon-sm" aria-label={`Color of ${tag.name}`} />}
      >
        <span style={tagStyle(current)} className="size-4 rounded-full bg-(--tag)" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-2">
        <div role="group" aria-label="Colors" className="grid grid-cols-6 gap-1.5">
          {colors.map((color, index) => (
            <Button
              key={color}
              variant="ghost"
              size="icon-sm"
              aria-label={COLOR_NAMES[index] ?? color}
              aria-pressed={tag.color === color}
              style={tagStyle(color)}
              className="rounded-full bg-(--tag) text-(--tag-ink) hover:bg-(--tag) hover:text-(--tag-ink) hover:opacity-85"
              onClick={() => pick(color)}
            >
              {current === color && <Check />}
            </Button>
          ))}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="mt-2 w-full justify-start text-muted-foreground"
          disabled={tag.color === null}
          onClick={() => pick(null)}
        >
          <span
            style={tagStyle(paletteColor(tag.name))}
            className="size-3 rounded-full bg-(--tag)"
          />
          Default color
        </Button>
      </PopoverContent>
    </Popover>
  );
}

// The person's tags as a page (decision 0107): each with its color, which they change, and what
// carries it, and a line that adds one before anything does.
export function TagsPage() {
  const { tags, add } = useTags();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const name = normalizeTag(draft);
  const valid = TAG_PATTERN.test(name);
  const taken = tags.some((tag) => tag.name === name);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid || taken || busy) return;
    setBusy(true);
    try {
      if (await add(name)) setDraft("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="cockpit-doc mx-auto w-full max-w-[46rem] px-(--doc-gutter) pt-12 pb-24 md:pt-20">
      <h1 className="text-[2.5rem] leading-tight font-bold tracking-tight">Tags</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {tags.length === 1 ? "1 tag" : `${tags.length} tags`}. A tag's color shows wherever it is.
      </p>
      <Form
        onSubmit={onSubmit}
        className="mt-8 flex items-center gap-2 border-b border-border/60 pb-2"
      >
        <Tag className="size-4 shrink-0 text-muted-foreground" />
        <Input
          aria-label="New tag"
          placeholder="New tag"
          value={draft}
          maxLength={32}
          onChange={(event) => setDraft(event.target.value)}
          className="h-8 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
        />
        {taken && <span className="shrink-0 text-xs text-muted-foreground">Already a tag</span>}
        <Button type="submit" size="sm" disabled={!valid || taken || busy}>
          Add tag
        </Button>
      </Form>
      {tags.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          No tags yet. Add one here, or give a record one.
        </p>
      ) : (
        <ul aria-label="All tags" className="-mx-2 mt-2 flex flex-col gap-px">
          {tags.map((tag) => (
            <li
              key={tag.name}
              aria-label={tag.name}
              className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/60"
            >
              <ColorPicker tag={tag} />
              <TagBadge tag={tag.name} />
              <span className="ml-auto truncate text-xs text-muted-foreground">{usedBy(tag)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
