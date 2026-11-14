import { createFileRoute } from "@tanstack/react-router";

import { Skeleton } from "@aven/ui/skeleton";
import { ActivityHeatmap } from "@/modules/profile/components/activity-heatmap";
import { ProfileHeader } from "@/modules/profile/components/profile-header";
import { ProfileStats } from "@/modules/profile/components/profile-stats";
import { TokensChart } from "@/modules/profile/components/tokens-chart";
import { useProfileStats } from "@/modules/profile/hooks/use-profile-stats";

export const Route = createFileRoute("/_authed/settings/profile")({
  component: Profile,
});

function Profile() {
  const { user } = Route.useRouteContext();
  const { stats, failed } = useProfileStats();

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-10 px-4 py-10 md:py-14">
      <ProfileHeader name={user.name} email={user.email} image={user.image} stats={stats} />
      {failed && (
        <p className="text-sm text-muted-foreground">
          Your activity could not be loaded. Reload the page to try again.
        </p>
      )}
      {!failed && !stats && (
        <div className="flex flex-col gap-10">
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="flex flex-col gap-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-5 w-12" />
              </div>
            ))}
          </div>
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-56 w-full" />
        </div>
      )}
      {stats && (
        <>
          <ProfileStats stats={stats} />
          <ActivityHeatmap days={stats.days} today={stats.today} />
          <TokensChart days={stats.days} today={stats.today} tokens={stats.tokens} />
        </>
      )}
    </div>
  );
}
