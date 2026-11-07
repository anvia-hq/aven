import { Grid } from "@mynaui/icons-react";
import { useRouterState } from "@tanstack/react-router";

import { RailLink } from "@/components/rail-link";

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
