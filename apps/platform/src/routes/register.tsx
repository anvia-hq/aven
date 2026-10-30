import { createFileRoute, Link } from "@tanstack/react-router";

import { usePlatformConfig } from "@/modules/platform/hooks/use-platform-config";
import { useContinueAfterAuth } from "@/modules/auth/hooks/use-continue-after-auth";
import { validateInvitationSearch } from "@/modules/auth/invitation-search";
import { redirectIfSignedIn } from "@/modules/auth/redirect-if-signed-in";
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
    <main className="mx-auto flex min-h-screen max-w-xs flex-col justify-center gap-4 p-4">
      <h1 className="text-lg font-semibold">Create your account</h1>
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
