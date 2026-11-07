import { createFileRoute } from "@tanstack/react-router";

import { CenterPage } from "@/modules/center/components/center-page";
import { parseCenterSearch } from "@/modules/center/filters";

export const Route = createFileRoute("/_authed/center/")({
  validateSearch: parseCenterSearch,
  component: CenterPage,
});
