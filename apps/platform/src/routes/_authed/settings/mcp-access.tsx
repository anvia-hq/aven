import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed/settings/mcp-access")({
  beforeLoad: () => {
    throw redirect({ to: "/settings/mcp", search: { tab: "access" }, replace: true });
  },
});
