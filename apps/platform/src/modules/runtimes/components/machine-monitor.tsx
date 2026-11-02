import { SidebarGroup, SidebarGroupLabel } from "@/components/sidebar";

import { useRuntimes } from "../hooks/use-runtimes";
import { MachineRow } from "./machine-row";

// The workspace's runners at the top of Settings' menu, one row each (decision 0091). It polls, as
// a machine's load changes without anyone doing anything; with no runner there is nothing to show.
export function MachineMonitor() {
  const { runtimes } = useRuntimes({ poll: true });
  if (runtimes.length === 0) return null;
  // The machines at work first, each group oldest first, so a row does not move as one is added.
  const ordered = [...runtimes].sort(
    (a, b) => Number(b.online) - Number(a.online) || a.createdAt.localeCompare(b.createdAt),
  );

  return (
    <SidebarGroup className="py-1 group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>Machines</SidebarGroupLabel>
      <ul aria-label="Machines" className="flex flex-col gap-2">
        {ordered.map((runtime) => (
          <MachineRow key={runtime.id} runtime={runtime} />
        ))}
      </ul>
    </SidebarGroup>
  );
}
