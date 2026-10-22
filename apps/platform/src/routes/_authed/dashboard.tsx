import { createFileRoute } from "@tanstack/react-router";

import { api } from "../../lib/api";
import { StatCard } from "../../modules/dashboard/components/stat-card";
import { UsersTable } from "../../modules/dashboard/components/users-table";
import type { DashboardStats, UserRow } from "../../modules/dashboard/types";

export const Route = createFileRoute("/_authed/dashboard")({
  loader: async () => {
    const [stats, users] = await Promise.all([
      api<DashboardStats>("/dashboard/stats"),
      api<UserRow[]>("/users"),
    ]);
    return { stats, users };
  },
  component: Dashboard,
});

function Dashboard() {
  const { stats, users } = Route.useLoaderData();

  return (
    <main className="flex w-full flex-col gap-8 p-6 lg:p-8">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <section aria-label="Stats" className="grid gap-4 md:grid-cols-3">
        <StatCard label="Users" value={stats.users} />
        <StatCard label="Active sessions" value={stats.activeSessions} />
        <StatCard label="Signups (7 days)" value={stats.signupsLast7Days} />
      </section>
      <section aria-label="Users">
        <h2 className="mb-2 text-lg font-semibold">Users</h2>
        <UsersTable users={users} />
      </section>
    </main>
  );
}
