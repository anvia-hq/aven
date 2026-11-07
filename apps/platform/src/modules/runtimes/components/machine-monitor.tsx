import { useRuntimes } from "../hooks/use-runtimes";
import { MachineRow } from "./machine-row";

export function MachineMonitor() {
  const { runtimes } = useRuntimes({ poll: true });
  if (runtimes.length === 0) return null;
  const ordered = [...runtimes].sort(
    (a, b) => Number(b.online) - Number(a.online) || a.createdAt.localeCompare(b.createdAt),
  );

  return (
    <div className="-mx-2 border-b px-2 pb-2 group-data-[collapsible=icon]:hidden">
      <ul aria-label="Machines" className="flex flex-col gap-1">
        {ordered.map((runtime) => (
          <MachineRow key={runtime.id} runtime={runtime} />
        ))}
      </ul>
    </div>
  );
}
