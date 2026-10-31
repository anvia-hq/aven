import { createFileRoute } from "@tanstack/react-router";

import { BotSidebar } from "@/modules/bots/components/bot-sidebar";
import { AppShell } from "@/modules/navigation/components/app-shell";

// The bot's own shell: the same frame as threads, with the person's bots in the sidebar.
export const Route = createFileRoute("/_authed/bot")({
  component: BotLayout,
});

function BotLayout() {
  const { user } = Route.useRouteContext();
  return <AppShell user={user} sidebar={<BotSidebar />} />;
}
