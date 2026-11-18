import { InboxIcon } from "@solar-icons/react/linear";
import { useRouterState } from "@tanstack/react-router";

import { RailLink } from "@/components/rail-link";

export function CockpitRailLink() {
  const active = useRouterState({
    select: (state) => (state.resolvedLocation ?? state.location).pathname.startsWith("/cockpit"),
  });
  return (
    <RailLink to="/cockpit/inbox" label="Inbox" active={active}>
      <InboxIcon className="size-[17px]" strokeWidth={1.7} />
    </RailLink>
  );
}
