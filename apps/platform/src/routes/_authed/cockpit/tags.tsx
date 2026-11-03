import { createFileRoute } from "@tanstack/react-router";

import { TagsPage } from "@/modules/cockpit/components/tags-page";

export const Route = createFileRoute("/_authed/cockpit/tags")({
  component: TagsPage,
});
