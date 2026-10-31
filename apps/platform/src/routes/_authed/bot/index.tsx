import { createFileRoute } from "@tanstack/react-router";

import { BotWorkspace } from "@/modules/bots/components/bot-workspace";
import { useBots } from "@/modules/bots/hooks/use-bots";

export const Route = createFileRoute("/_authed/bot/")({
  component: BotPage,
});

// The person's main bot: always there, made the first time they open this page.
function BotPage() {
  const { main } = useBots();
  if (!main) return null;
  return <BotWorkspace key={main.id} bot={main} />;
}
