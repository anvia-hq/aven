import { Search, X } from "@mynaui/icons-react";

import { Button } from "@/components/button";
import { SidebarTrigger, useSidebar } from "@/components/sidebar";

import { useCommandMenu } from "../hooks/use-command-menu";

/**
 * The bar over every page on a phone: the way into the sidebar (the threads, the app's own list,
 * Settings and the theme) and into search. It carries no title of its own: the tab bar under the
 * page says which app you are in, and the page says what it is, so a name here would only repeat
 * one of them. It stays put while the page scrolls under it.
 */
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
