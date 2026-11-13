import { createRootRoute, Outlet } from "@tanstack/react-router";

import { Toaster } from "@aven/ui/toast";
import { useTheme } from "@/modules/theme/hooks/use-theme";

export const Route = createRootRoute({
  component: Root,
});

function Root() {
  useTheme();

  return (
    <Toaster>
      <div className="min-h-screen bg-background text-foreground">
        <Outlet />
      </div>
    </Toaster>
  );
}
