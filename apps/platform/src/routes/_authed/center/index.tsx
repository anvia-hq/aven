import { createFileRoute } from "@tanstack/react-router";

import { CenterPage } from "@/modules/center/components/center-page";
import { parseCenterSearch } from "@/modules/center/filters";

export const Route = createFileRoute("/_authed/center/")({
  // `project` picks one project to look at; the rest narrow its pull requests (`filters.ts`).
  validateSearch: parseCenterSearch,
  component: CenterPage,
});
