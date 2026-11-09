import { Globe, Users } from "@mynaui/icons-react";

import type { Thread } from "../types";

export function SharedNotice({ thread, driven }: { thread: Thread; driven: boolean }) {
  const Icon = driven ? Users : Globe;
  return (
    <div className="mb-2 flex items-center gap-2 rounded-2xl border bg-card px-4 py-3 text-sm text-muted-foreground shadow-md">
      <Icon className="size-4 shrink-0" />
      <span>
        {driven ? (
          <>
            Multiplayer is on. Commits and pull requests are yours, through your GitHub. The model,
            memory and bill are{" "}
            <span className="font-medium text-foreground">{thread.createdByName}</span>'s.
          </>
        ) : (
          <>
            Shared by <span className="font-medium text-foreground">{thread.createdByName}</span>.
            You can read this thread, not reply to it.
          </>
        )}
      </span>
    </div>
  );
}
