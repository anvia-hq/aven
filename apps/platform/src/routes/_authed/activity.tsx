import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/page-header";
import { ActivityFeed } from "@/modules/activity/components/activity-feed";

export const Route = createFileRoute("/_authed/activity")({
  component: Activity,
});

function Activity() {
  return (
    <main className="flex w-full max-w-3xl flex-col gap-6 p-6 lg:p-8">
      <PageHeader title="Activity" description="What the agent and your team have been up to." />
      <ActivityFeed />
    </main>
  );
}
