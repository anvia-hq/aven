import { Globe, Users } from "@mynaui/icons-react";

import type { Thread } from "../types";

export function SharedNotice({ thread, driven }: { thread: Thread; driven: boolean }) {
  const Icon = driven ? Users : Globe;
  return (
    <div className="mb-2 flex w-fit max-w-full items-center gap-2 rounded-xl border bg-card px-3 py-2 text-xs text-muted-foreground shadow-md">
      <Icon className="size-4 shrink-0" />
      <span className={driven ? "min-w-0 truncate" : undefined}>
        {driven ? (
          <>
            <span className="font-medium text-foreground">Multiplayer is on</span>
            <span className="mx-1.5">·</span>
            Your messages use your own model, bill and GitHub
            <span className="mx-1.5">·</span>
            Memory and workspace are{" "}
            <span className="font-medium text-foreground">{thread.createdByName}</span>'s
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
