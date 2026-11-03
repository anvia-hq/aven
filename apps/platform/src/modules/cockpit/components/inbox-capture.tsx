import { Plus } from "@mynaui/icons-react";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/button";
import { Form } from "@/components/form";
import { Input } from "@/components/input";

import { useInbox } from "../hooks/use-inbox";
import { TagInput } from "./tag-input";

// The line at the top of the inbox that captures a thing as it comes to mind, with its tags; the
// page's tag, if it has one, is given to what is captured there.
export function InboxCapture({ tag }: { tag?: string }) {
  const { capture } = useInbox();
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState<string[]>(tag ? [tag] : []);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      if (await capture({ title: title.trim(), tags })) {
        setTitle("");
        setTags(tag ? [tag] : []);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Form onSubmit={onSubmit} className="flex flex-col gap-2 rounded-xl border bg-card p-3">
      <div className="flex gap-2">
        <Input
          aria-label="Capture"
          placeholder="What's on your mind?"
          value={title}
          maxLength={200}
          onChange={(event) => setTitle(event.target.value)}
        />
        <Button type="submit" disabled={busy || !title.trim()}>
          <Plus /> Capture
        </Button>
      </div>
      <TagInput value={tags} onChange={setTags} label="Tags for the capture" />
    </Form>
  );
}
