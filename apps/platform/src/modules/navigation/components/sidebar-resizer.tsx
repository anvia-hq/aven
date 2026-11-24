import type { useSidebarWidth } from "../hooks/use-sidebar-width";

type Props = { size: ReturnType<typeof useSidebarWidth> };

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
      className="absolute inset-y-0 -right-1 z-20 hidden w-2 cursor-col-resize touch-none outline-hidden group-data-[collapsible=icon]:group-data-[state=collapsed]:hidden md:block"
    />
  );
}
