import { Search, X } from "@mynaui/icons-react";
import { useRouterState } from "@tanstack/react-router";

import { Button } from "@/components/button";
import { SidebarTrigger, useSidebar } from "@/components/sidebar";

import { useCommandMenu } from "../hooks/use-command-menu";
import { sectionTitleOf } from "../sections";

/**
 * The bar over every page on a phone: the way into the sidebar (the threads, the app's own list,
 * Settings and the theme) and into search, and the name of the app you are in, since the page's own
 * header says the finer thing. It stays put while the page scrolls under it.
 */
export function MobileAppBar() {
  const { setOpen: setCommandOpen } = useCommandMenu();
  const pathname = useRouterState({
    select: (state) => (state.resolvedLocation ?? state.location).pathname,
  });

  return (
    <div className="sticky top-0 z-20 flex h-(--mobile-app-bar) shrink-0 items-center gap-0.5 border-b bg-background/95 pr-1.5 pl-1 backdrop-blur-sm md:hidden">
      <SidebarTrigger className="size-10 [&_svg:not([class*='size-'])]:size-5" />
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-muted-foreground">
        {sectionTitleOf(pathname)}
      </span>
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

/** The sheet hides its own close button, so the sidebar's header carries this one instead. */
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
