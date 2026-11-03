import { useRuntimes } from "../hooks/use-runtimes";
import { MachineRow } from "./machine-row";

// The workspace's runners above Settings in the sidebar, one compact row each in a card (decision
// 0091). It polls, as a machine's load changes without anyone doing anything; with no runner there
// is nothing to show, and the rows give way when the sidebar is collapsed to icons.
export function MachineMonitor() {
  const { runtimes } = useRuntimes({ poll: true });
  if (runtimes.length === 0) return null;
  // The machines at work first, each group oldest first, so a row does not move as one is added.
  const ordered = [...runtimes].sort(
    (a, b) => Number(b.online) - Number(a.online) || a.createdAt.localeCompare(b.createdAt),
  );

  return (
    // The rule under the card runs the sidebar's full width, past the footer's padding.
    <div className="-mx-2 border-b px-2 pb-2 group-data-[collapsible=icon]:hidden">
      <ul aria-label="Machines" className="flex flex-col gap-0.5 rounded-lg border bg-card p-1">
        {ordered.map((runtime) => (
          <MachineRow key={runtime.id} runtime={runtime} />
        ))}
      </ul>
    </div>
  );
}
