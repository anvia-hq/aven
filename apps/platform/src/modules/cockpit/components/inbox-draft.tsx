import { Tag } from "@mynaui/icons-react";
import { useBlocker } from "@tanstack/react-router";
import { useRef, useState, type KeyboardEvent } from "react";

import { Button } from "@/components/button";

import { useInbox } from "../hooks/use-inbox";
import {
  Crumb,
  CurrentCrumb,
  DocumentBody,
  DocumentPage,
  DocumentTitle,
  Properties,
  Property,
} from "./document-page";
import { TagInput } from "./tag-input";

// A new inbox item before it is kept (decision 0106): a page like an item's own, written in and
// then added to the inbox, or cancelled and gone, nothing of it sent. ⌘ or Ctrl and Enter add it.
export function InboxDraft({
  tag,
  onAdded,
  onCancel,
}: {
  tag?: string;
  onAdded: (id: string) => void;
  onCancel: () => void;
}) {
  const { capture } = useInbox();
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState<string[]>(tag ? [tag] : []);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const ready = title.trim() !== "" && !busy;
  // Leaving by another row or link asks first when something is written; adding it or Cancel
  // are the person's own way out (`settled`).
  const settled = useRef(false);
  const written = title.trim() !== "" || body !== "";
  useBlocker({
    shouldBlockFn: () => written && !settled.current && !window.confirm("Discard this new item?"),
    enableBeforeUnload: () => written && !settled.current,
  });
  const cancel = () => {
    settled.current = true;
    onCancel();
  };

  async function add() {
    if (!ready) return;
    setBusy(true);
    try {
      settled.current = true;
      const made = await capture({ title: title.trim(), body, tags });
      if (made) onAdded(made.id);
      else settled.current = false;
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void add();
    }
  }

  return (
    <DocumentPage
      label="New item"
      onBack={cancel}
      backLabel="Back to the inbox"
      trail={
        <>
          <Crumb onClick={cancel}>Inbox</Crumb>
          <CurrentCrumb>New</CurrentCrumb>
        </>
      }
      actions={
        <>
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={cancel}>
            Cancel
          </Button>
          <Button size="sm" disabled={!ready} onClick={() => void add()}>
            Add to inbox
          </Button>
        </>
      }
    >
      <div onKeyDown={onKeyDown}>
        <DocumentTitle value={title} autoFocus onChange={setTitle} onCommit={() => {}} />
        <Properties>
          <Property icon={Tag} label="Tags">
            <TagInput bare value={tags} onChange={setTags} />
          </Property>
        </Properties>
        <DocumentBody
          key="new"
          label="Details"
          value=""
          placeholder="Add details, or press '/' for blocks"
          onChange={setBody}
        />
      </div>
    </DocumentPage>
  );
}
