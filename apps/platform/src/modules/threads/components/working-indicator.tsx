import { Spinner } from "@mynaui/icons-react";

// Sits under the conversation while the agent works, whether it is writing, running a tool or
// waiting for the model's first token. It is sticky at the offset the end of the conversation has
// (the list's bottom padding), so while the text above grows and the scroll follows a frame behind,
// it stays put in the viewport instead of bouncing with each delta.
export function WorkingIndicator() {
  return (
    <div className="sticky bottom-48 z-10 flex items-center gap-2 bg-background text-sm text-muted-foreground">
      <Spinner className="size-4 animate-spin" aria-hidden />
      <span role="status">Working…</span>
    </div>
  );
}
