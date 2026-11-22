import { createFileRoute } from "@tanstack/react-router";

import { BotAvatarsShowcase } from "@/modules/bots/components/bot-avatars-showcase";

export const Route = createFileRoute("/_authed/bot/avatars")({
  component: BotAvatarsShowcase,
});
