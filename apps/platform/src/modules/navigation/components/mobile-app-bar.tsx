import { Search, X } from "@mynaui/icons-react";

import { Button } from "@aven/ui/button";
import { SidebarTrigger, useSidebar } from "@aven/ui/sidebar";

import { useCommandMenu } from "../hooks/use-command-menu";

export function MobileAppBar() {
  const { setOpen: setCommandOpen } = useCommandMenu();

  return (
    <div className="sticky top-0 z-20 flex h-(--mobile-app-bar) shrink-0 items-center justify-between border-b bg-background/95 px-1.5 backdrop-blur-sm md:hidden">
      <SidebarTrigger className="size-10 [&_svg:not([class*='size-'])]:size-5" />
      <Button
        variant="ghost"
        size="icon"
        className="size-10"
        aria-label="Search"
        onClick={() => setCommandOpen(true)}
      >
        <Search className="size-5" />
      </Button>
    </div>
  );
}

export function MobileSidebarClose() {
  const { setOpenMobile } = useSidebar();
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-9 shrink-0 md:hidden"
      aria-label="Close navigation"
      onClick={() => setOpenMobile(false)}
    >
      <X className="size-5" />
    </Button>
  );
}
