import { Rocket } from "@mynaui/icons-react";

export function ShipRequestCard() {
  return (
    <div
      className="my-6 ml-auto flex w-full max-w-[85%] items-center gap-3 rounded-lg border bg-card px-3 py-2.5 text-sm sm:max-w-md"
      data-role="user"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent">
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
