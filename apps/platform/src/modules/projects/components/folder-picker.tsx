import { ArrowLeft, Folder, FolderPlus, Home } from "@mynaui/icons-react";
import { useRef, useState, type KeyboardEvent } from "react";

import { Button } from "@/components/button";
import { Field, FieldLabel } from "@/components/field";
import { TextField } from "@/components/text-field";
import { toast } from "@/components/toast";
import { ApiError, api, postJson } from "@/lib/api";

import type { DirectoryListing } from "../types";

type Props = {
  value: string;
  onChange: (path: string) => void;
};

// Browsers cannot hand a web page a real OS path, so this walks the control-plane machine's
// filesystem instead. Browsing swaps in place inside the same dialog (not a nested Dialog) since
// Base UI doesn't stack two Dialog roots the way this needs. Typing a path (not just clicking)
// matters: a project can live outside the home directory entirely (another mounted volume),
// which a click-only picker could never reach.
export function FolderPicker({ value, onChange }: Props) {
  const [browsing, setBrowsing] = useState(false);
  const [listing, setListing] = useState<DirectoryListing | null>(null);
  const [pathInput, setPathInput] = useState("");
  const [loading, setLoading] = useState(false);
  // Clicking Home/Up/an entry can overlap with the user typing-and-pressing-Enter: only the most
  // recently issued request is allowed to update state, so an older response in flight can never
  // clobber a newer one that happened to resolve first.
  const latestRequest = useRef(0);
  // Separately: a load's success also must not overwrite the path field if the user has since
  // typed into it — otherwise the initial auto-load (home) can land mid-keystroke and stomp
  // whatever they're typing before they've even pressed Enter.
  const editedSincePathLoad = useRef(false);
  const pathInputRef = useRef<HTMLInputElement>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [creating, setCreating] = useState(false);

  async function load(path?: string) {
    const requestId = ++latestRequest.current;
    editedSincePathLoad.current = false;
    setLoading(true);
    try {
      const query = path ? `?path=${encodeURIComponent(path)}` : "";
      const result = await api<DirectoryListing>(`/projects/browse${query}`);
      if (requestId !== latestRequest.current) return;
      setListing(result);
      if (!editedSincePathLoad.current) setPathInput(result.path);
    } catch (failure) {
      if (requestId !== latestRequest.current) return;
      const message = failure instanceof ApiError ? failure.message : "Could not reach the server";
      toast.add({ title: "Could not browse folder", description: message, type: "error" });
    } finally {
      if (requestId === latestRequest.current) setLoading(false);
    }
  }

  function startBrowsing() {
    setBrowsing(true);
    void load(value || undefined);
  }

  function handlePathKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      // Read the DOM value directly rather than the `pathInput` state: a fill-then-Enter in
      // very quick succession can otherwise fire before React has committed the state update
      // from the preceding change, capturing a stale (pre-edit) value in this closure.
      void load(event.currentTarget.value);
    }
  }

  function choose() {
    if (!listing) return;
    onChange(listing.path);
    setBrowsing(false);
    setListing(null);
  }

  function cancelCreatingFolder() {
    setCreatingFolder(false);
    setFolderName("");
  }

  async function createFolder() {
    const name = folderName.trim();
    if (!listing || !name) return;
    setCreating(true);
    try {
      const result = await postJson<DirectoryListing>("/projects/browse", {
        path: listing.path,
        name,
      });
      setListing(result);
      cancelCreatingFolder();
    } catch (failure) {
      const message = failure instanceof ApiError ? failure.message : "Could not reach the server";
      toast.add({ title: "Could not create folder", description: message, type: "error" });
    } finally {
      setCreating(false);
    }
  }

  function handleFolderNameKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void createFolder();
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancelCreatingFolder();
    }
  }

  if (!browsing) {
    return (
      <Field>
        <FieldLabel>Project path</FieldLabel>
        <Button
          type="button"
          variant="outline"
          className="w-full justify-start font-mono font-normal text-foreground"
          onClick={startBrowsing}
        >
          <Folder className="shrink-0" />
          <span className="truncate">{value || "Choose a folder…"}</span>
        </Button>
      </Field>
    );
  }

  return (
    <Field>
      <div className="flex items-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label="Up"
          disabled={!listing?.parent}
          onClick={() => void load(listing?.parent ?? undefined)}
        >
          <ArrowLeft />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label="Home"
          onClick={() => void load()}
        >
          <Home />
        </Button>
        <div className="flex-1">
          <TextField
            ref={pathInputRef}
            label="Path"
            value={pathInput}
            onChange={(event) => {
              editedSincePathLoad.current = true;
              setPathInput(event.target.value);
            }}
            onKeyDown={handlePathKeyDown}
            className="font-mono"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => void load(pathInputRef.current?.value ?? pathInput)}
        >
          Go
        </Button>
      </div>

      {creatingFolder ? (
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <TextField
              label="New folder name"
              value={folderName}
              onChange={(event) => setFolderName(event.target.value)}
              onKeyDown={handleFolderNameKeyDown}
              placeholder="my-folder"
              autoFocus
            />
          </div>
          <Button type="button" variant="outline" onClick={cancelCreatingFolder}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void createFolder()}
            disabled={!folderName.trim() || creating}
          >
            Create
          </Button>
        </div>
      ) : (
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="font-normal"
            disabled={!listing}
            onClick={() => setCreatingFolder(true)}
          >
            <FolderPlus className="size-4" /> New folder
          </Button>
        </div>
      )}

      <div className="flex max-h-72 flex-col overflow-y-auto rounded-lg border">
        {listing?.entries.map((entry) => (
          <Button
            key={entry.path}
            type="button"
            variant="ghost"
            className="justify-start rounded-none border-b px-3 py-2 font-normal last:border-b-0"
            onClick={() => void load(entry.path)}
          >
            <Folder className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{entry.name}</span>
          </Button>
        ))}
        {listing && listing.entries.length === 0 && (
          <p className="p-3 text-sm text-muted-foreground">No subfolders</p>
        )}
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => setBrowsing(false)}>
          Cancel
        </Button>
        <Button type="button" onClick={choose} disabled={!listing || loading}>
          Choose this folder
        </Button>
      </div>
    </Field>
  );
}
