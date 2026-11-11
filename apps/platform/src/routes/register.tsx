import { createFileRoute, Link } from "@tanstack/react-router";

import { usePlatformConfig } from "@/modules/platform/hooks/use-platform-config";
import { useContinueAfterAuth } from "@/modules/auth/hooks/use-continue-after-auth";
import { validateInvitationSearch } from "@/modules/auth/invitation-search";
import { redirectIfSignedIn } from "@/modules/auth/redirect-if-signed-in";
import { AuthShell } from "@/modules/auth/components/auth-shell";
import { AuthForm } from "@/modules/auth/components/auth-form";

export const Route = createFileRoute("/register")({
  validateSearch: validateInvitationSearch,
  beforeLoad: ({ search }) => redirectIfSignedIn(search),
  component: Register,
});

function Register() {
  const search = Route.useSearch();
  const { invitation } = search;
  const onSuccess = useContinueAfterAuth(search);
  const { config } = usePlatformConfig();
  const closed = Boolean(config && !config.registrationEnabled && !invitation);

  return (
    <AuthShell
      title="Create your account"
      description="Set up Aven on your own machines in a minute."
      footer={
        <>
          Already have an account?{" "}
          <Link
            to="/login"
            search={{ invitation }}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </>
      }
    >
      {closed ? (
        <p role="status" className="text-sm text-muted-foreground">
          Registration is closed. Ask a teammate for an invite link to join.
        </p>
      ) : (
        <AuthForm mode="sign-up" onSuccess={onSuccess} />
      )}
    </AuthShell>
  );
}
