import { createFileRoute } from "@tanstack/react-router";

import { AutomationsPage } from "@/modules/automations/components/automations-page";

export const Route = createFileRoute("/_authed/automations/")({
  component: AutomationsPage,
});
