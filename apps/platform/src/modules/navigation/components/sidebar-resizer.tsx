import type { useSidebarWidth } from "../hooks/use-sidebar-width";

type Props = { size: ReturnType<typeof useSidebarWidth> };

// The sidebar's edge as a drag handle, drawn like the handle between a thread's panels.
export function SidebarResizer({ size }: Props) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      aria-valuenow={size.width}
      aria-valuemin={size.min}
      aria-valuemax={size.max}
      tabIndex={0}
      {...size.handlers}
      className="group/resizer absolute inset-y-0 -right-1 z-20 hidden w-2 cursor-col-resize touch-none items-center justify-center outline-hidden group-data-[collapsible=icon]:group-data-[state=collapsed]:hidden md:flex"
    >
      <div className="z-10 h-6 w-1 shrink-0 rounded-lg bg-border opacity-0 transition-opacity group-hover/resizer:opacity-100 group-focus-visible/resizer:opacity-100" />
    </div>
  );
}
