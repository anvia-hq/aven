import { createFileRoute, Outlet } from "@tanstack/react-router";

import { CommandMenu } from "@/modules/navigation/components/command-menu";
import { SettingsNav } from "@/modules/settings/components/settings-nav";

export const Route = createFileRoute("/_authed/settings")({
  component: SettingsLayout,
});

function SettingsLayout() {
  const { user } = Route.useRouteContext();

  return (
    <>
      <div className="flex h-svh w-full min-w-0 flex-col md:flex-row">
        <SettingsNav name={user.name} email={user.email} />
        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-4xl px-4 py-8 md:py-14">
            <Outlet />
          </div>
        </main>
      </div>
      <CommandMenu />
    </>
  );
}
