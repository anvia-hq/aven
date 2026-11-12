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

function Login() {
  const search = Route.useSearch();
  const { invitation } = search;
  const onSuccess = useContinueAfterAuth(search);
  const { config } = usePlatformConfig();
  return (
    <AuthShell
      title="Sign in to Aven"
      description="Welcome back. Enter your details to continue."
      footer={
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
      }
    >
      <AuthForm mode="sign-in" onSuccess={onSuccess} />
      {config?.githubLogin && <GithubSignIn invitation={invitation} />}
    </AuthShell>
  );
}
