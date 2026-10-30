import { createFileRoute, Link } from "@tanstack/react-router";

import { useContinueAfterAuth } from "@/modules/auth/hooks/use-continue-after-auth";
import { validateInvitationSearch } from "@/modules/auth/invitation-search";
import { redirectIfSignedIn } from "@/modules/auth/redirect-if-signed-in";
import { AuthForm } from "@/modules/auth/components/auth-form";

export const Route = createFileRoute("/login")({
  validateSearch: validateInvitationSearch,
  beforeLoad: ({ search }) => redirectIfSignedIn(search),
  component: Login,
});

function Login() {
  const search = Route.useSearch();
  const { invitation } = search;
  const onSuccess = useContinueAfterAuth(search);
  return (
    <main className="mx-auto flex min-h-screen max-w-xs flex-col justify-center gap-4 p-4">
      <h1 className="text-lg font-semibold">Sign in to Aven</h1>
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
