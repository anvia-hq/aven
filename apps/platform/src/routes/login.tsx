import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";

import { authClient } from "@/lib/auth-client";
import { validateInvitationSearch } from "@/modules/auth/invitation-search";
import { AuthForm } from "@/modules/auth/components/auth-form";

export const Route = createFileRoute("/login")({
  validateSearch: validateInvitationSearch,
  beforeLoad: async ({ search }) => {
    const { data } = await authClient.getSession();
    if (!data) return;
    if (search.invitation) {
      throw redirect({
        to: "/accept-invitation/$invitationId",
        params: { invitationId: search.invitation },
      });
    }
    throw redirect({ to: "/threads" });
  },
  component: Login,
});

function Login() {
  const navigate = useNavigate();
  const { invitation } = Route.useSearch();

  function onSuccess() {
    if (invitation) {
      return navigate({
        to: "/accept-invitation/$invitationId",
        params: { invitationId: invitation },
      });
    }
    return navigate({ to: "/threads" });
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-8">
      <h1 className="text-2xl font-bold">Sign in to Aven</h1>
      <AuthForm mode="sign-in" onSuccess={onSuccess} />
      <p className="text-sm text-muted-foreground">
        Don't have an account?{" "}
        <Link
          to="/register"
          search={{ invitation }}
          className="font-medium text-foreground underline"
        >
          Register
        </Link>
      </p>
    </main>
  );
}
