import { createFileRoute, Navigate } from "@tanstack/react-router";

import { BotWorkspace } from "@/modules/bots/components/bot-workspace";
import { useBots } from "@/modules/bots/hooks/use-bots";

export const Route = createFileRoute("/_authed/bot/$botId")({
  validateSearch: (search: Record<string, unknown>): { artifact?: string } => ({
    artifact:
      typeof search.artifact === "string" && search.artifact !== "" ? search.artifact : undefined,
  }),
  component: OtherBotPage,
});

function OtherBotPage() {
  const { botId } = Route.useParams();
  const { bots, loaded } = useBots();
  const bot = bots.find((each) => each.id === botId);

  if (bot) return <BotWorkspace key={bot.id} bot={bot} />;

  return loaded ? <Navigate to="/bot" replace /> : null;
}
