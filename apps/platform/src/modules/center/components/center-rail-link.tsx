import { GitBranch } from "@mynaui/icons-react";
import { useRouterState } from "@tanstack/react-router";

import { RailLink } from "@/components/rail-link";

// The entry to Center in the rail, under the cockpit's: every project's pull requests and commits
// on one screen.
export function CenterRailLink() {
  const active = useRouterState({
    select: (state) => (state.resolvedLocation ?? state.location).pathname.startsWith("/center"),
  });
  return (
    <RailLink to="/center" label="Center" active={active}>
      <GitBranch className="size-5" strokeWidth={1.7} />
    </RailLink>
  );
}
