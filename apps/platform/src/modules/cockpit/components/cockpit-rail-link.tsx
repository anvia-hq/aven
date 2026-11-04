import { Grid } from "@mynaui/icons-react";
import { useRouterState } from "@tanstack/react-router";

import { RailLink } from "@/components/rail-link";

// The entry to the cockpit in the rail, under the bot's, with a bar on the rail's edge while the
// page is the cockpit's (decision 0104).
export function CockpitRailLink() {
  const active = useRouterState({
    select: (state) => (state.resolvedLocation ?? state.location).pathname.startsWith("/cockpit"),
  });
  return (
    <RailLink to="/cockpit/inbox" label="Cockpit" active={active}>
      <Grid className="size-5" strokeWidth={1.7} />
    </RailLink>
  );
}
