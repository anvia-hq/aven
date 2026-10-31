import { createFileRoute } from "@tanstack/react-router";

import { BotChat } from "@/modules/bots/components/bot-chat";
import { useBots } from "@/modules/bots/hooks/use-bots";

export const Route = createFileRoute("/_authed/_shell/bot")({
  component: BotPage,
});

// The person's main bot: always there, made the first time they open this page.
function BotPage() {
  const { main } = useBots();
  if (!main) return null;
  return <BotChat key={main.id} bot={main} />;
}
