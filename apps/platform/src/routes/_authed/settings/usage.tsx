import { createFileRoute } from "@tanstack/react-router";

import { UsagePanel } from "@/modules/settings/components/usage-panel";

export const Route = createFileRoute("/_authed/settings/usage")({
  component: UsagePanel,
});
