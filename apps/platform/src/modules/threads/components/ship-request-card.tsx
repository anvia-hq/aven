import { Rocket } from "@mynaui/icons-react";

export function ShipRequestCard() {
  return (
    <div
      className="ml-auto flex w-fit max-w-[85%] items-center gap-3 rounded-full border bg-card py-2 pr-5 pl-2 text-sm"
      data-role="user"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-linear-to-r from-ship-from via-ship-via to-ship-to text-ship-foreground">
        <Rocket className="size-4" />
      </span>
      <span className="min-w-0">
        <span className="block font-medium">Ship this thread</span>
        <span className="block truncate text-xs text-muted-foreground">
          Commit, push and open a pull request
        </span>
      </span>
    </div>
  );
}
