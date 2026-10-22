import { createRootRoute, Link, Outlet } from "@tanstack/react-router";

export const Route = createRootRoute({
  component: () => (
    <div className="min-h-screen bg-white text-neutral-900">
      <nav className="flex gap-4 border-b border-neutral-200 p-4">
        <Link to="/" className="[&.active]:font-semibold">
          Home
        </Link>
      </nav>
      <Outlet />
    </div>
  ),
});
