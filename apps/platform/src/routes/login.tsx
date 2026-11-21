import { createFileRoute, Link } from "@tanstack/react-router";

import { usePlatformConfig } from "@/modules/platform/hooks/use-platform-config";
import { useContinueAfterAuth } from "@/modules/auth/hooks/use-continue-after-auth";
import { validateInvitationSearch } from "@/modules/auth/invitation-search";
import { redirectIfSignedIn } from "@/modules/auth/redirect-if-signed-in";
import { AuthShell } from "@/modules/auth/components/auth-shell";
import { AuthForm } from "@/modules/auth/components/auth-form";
import { GithubSignIn } from "@/modules/auth/components/github-sign-in";

export const Route = createFileRoute("/login")({
  validateSearch: validateInvitationSearch,
  beforeLoad: ({ search }) => redirectIfSignedIn(search),
  component: Login,
});

function authErrorMessage(error: string) {
  const normalized = error.toLowerCase();

  if (
    normalized.includes("registration") ||
    normalized.includes("closed") ||
    normalized.includes("forbidden")
  ) {
    return "Registration is closed. Ask an administrator or teammate for an invite link.";
  }

  return "Sign-in could not be completed. Try again or contact support.";
}

function Login() {
  const search = Route.useSearch();
  const { invitation, error } = search;
  const onSuccess = useContinueAfterAuth(search);
  const { config } = usePlatformConfig();
  const canRegister = !config || config.registrationEnabled || Boolean(invitation);
  return (
    <AuthShell
      title="Sign in to Aven"
      description="Welcome back. Enter your details to continue."
      footer={
        canRegister ? (
          <>
            Don't have an account?{" "}
            <Link
              to="/register"
              search={{ invitation }}
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              Register
            </Link>
          </>
        ) : undefined
      }
    >
      {error && (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {authErrorMessage(error)}
        </p>
      )}
      {config?.emailLogin && <AuthForm mode="sign-in" onSuccess={onSuccess} />}
      {config?.githubLogin && <GithubSignIn invitation={invitation} divided={config.emailLogin} />}
    </AuthShell>
  );
}
