import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed/cockpit/")({
  beforeLoad: () => {
    throw redirect({ to: "/cockpit/inbox" });
  },
});
