import { createRootRoute, Outlet } from "@tanstack/react-router";

import { useTheme } from "../modules/theme/hooks/use-theme";

export const Route = createRootRoute({
  component: Root,
});

function Root() {
  useTheme();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Outlet />
    </div>
  );
}
