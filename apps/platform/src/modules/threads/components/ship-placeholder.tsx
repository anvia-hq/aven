import { useElapsed } from "@/hooks/use-elapsed";
import { SLOW_LOAD_MS } from "@/lib/slow-load";

export function ShipPlaceholder() {
  const slow = useElapsed(SLOW_LOAD_MS);
  return (
    <span
      className={`h-7 w-28 rounded-lg bg-muted transition-opacity duration-300 ${slow ? "animate-pulse" : "opacity-0"}`}
      role="status"
      aria-label="Reading the changes"
    />
  );
}
