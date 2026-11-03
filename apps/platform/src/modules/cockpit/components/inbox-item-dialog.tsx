import { useState, type FormEvent } from "react";

import { Button } from "@/components/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/dialog";
import { Field, FieldLabel } from "@/components/field";
import { Form } from "@/components/form";
import { Input } from "@/components/input";
import { Textarea } from "@/components/textarea";

import { useInbox } from "../hooks/use-inbox";
import type { InboxItem } from "../types";
import { TagInput } from "./tag-input";

function ItemForm({ item, onDone }: { item: InboxItem; onDone: () => void }) {
  const { update } = useInbox();
  const [title, setTitle] = useState(item.title);
  const [body, setBody] = useState(item.body);
  const [tags, setTags] = useState(item.tags);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await update(item, { title: title.trim(), body, tags })) onDone();
  }

  return (
    <Form onSubmit={onSubmit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Edit inbox item</DialogTitle>
      </DialogHeader>
      <Field>
        <FieldLabel>Title</FieldLabel>
        <Input
          aria-label="Title"
          required
          maxLength={200}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </Field>
      <Field>
        <FieldLabel>Details</FieldLabel>
        <Textarea
          aria-label="Details"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="min-h-28"
        />
      </Field>
      <Field>
        <FieldLabel>Tags</FieldLabel>
        <TagInput value={tags} onChange={setTags} />
      </Field>
      <DialogFooter>
        <Button type="submit" disabled={!title.trim()}>
          Save
        </Button>
      </DialogFooter>
    </Form>
  );
}

// An inbox item's title, details and tags, changed from its row.
export function InboxItemDialog({
  item,
  open,
  onOpenChange,
}: {
  item: InboxItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {open && <ItemForm item={item} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}
