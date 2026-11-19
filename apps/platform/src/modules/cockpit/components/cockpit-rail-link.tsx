import { IconInbox } from "@tabler/icons-react";

import { RailLink } from "@/components/rail-link";

export function CockpitRailLink({ active }: { active: boolean }) {
  return (
    <RailLink to="/cockpit/inbox" label="Inbox" active={active}>
      <IconInbox className="size-[17px]" style={{ strokeWidth: 1.7 }} />
    </RailLink>
  );
}
