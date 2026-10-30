import { Spinner } from "@mynaui/icons-react";

// Sits under the conversation while the agent works, whether it is writing, running a tool or
// waiting for the model's first token.
export function WorkingIndicator() {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Spinner className="size-4 animate-spin" aria-hidden />
      <span role="status">Working…</span>
    </div>
  );
}
