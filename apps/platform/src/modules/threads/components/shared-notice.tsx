import { Globe } from "@mynaui/icons-react";

import type { Thread } from "../types";

// Where the composer would be, in a thread that someone else made and shared with the workspace:
// it can be read, with its files and changes, and not replied to (decision 0084).
export function SharedNotice({ thread }: { thread: Thread }) {
  return (
    <div className="flex items-center gap-2 rounded-2xl border bg-card px-4 py-3 text-sm text-muted-foreground shadow-md">
      <Globe className="size-4 shrink-0" />
      <span>
        Shared by <span className="font-medium text-foreground">{thread.createdByName}</span>. You
        can read this thread, not reply to it.
      </span>
    </div>
  );
}
