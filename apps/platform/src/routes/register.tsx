import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";

import { authClient } from "@/lib/auth-client";
import { usePlatformConfig } from "@/modules/platform/hooks/use-platform-config";
import { validateInvitationSearch } from "@/modules/auth/invitation-search";
import { AuthForm } from "@/modules/auth/components/auth-form";

export const Route = createFileRoute("/register")({
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
  component: Register,
});

function Register() {
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

  const { config } = usePlatformConfig();
  const closed = Boolean(config && !config.registrationEnabled && !invitation);

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-8">
      <h1 className="text-2xl font-bold">Create your account</h1>
      {closed ? (
        <p role="status" className="text-sm text-muted-foreground">
          Registration is closed. Ask a teammate for an invite link to join.
        </p>
      ) : (
        <AuthForm mode="sign-up" onSuccess={onSuccess} />
      )}
      <p className="text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link to="/login" search={{ invitation }} className="font-medium text-foreground underline">
          Sign in
        </Link>
      </p>
    </main>
  );
}
