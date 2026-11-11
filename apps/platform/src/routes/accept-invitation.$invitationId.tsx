import { createFileRoute, Link } from "@tanstack/react-router";

import { Button, buttonVariants } from "@/components/button";
import { AuthShell } from "@/modules/auth/components/auth-shell";
import { useInvitation } from "@/modules/auth/hooks/use-invitation";
import { ROLE_LABELS } from "@/modules/settings/types";

export const Route = createFileRoute("/accept-invitation/$invitationId")({
  component: AcceptInvitation,
});

function AcceptInvitation() {
  const { invitationId } = Route.useParams();
  const { signedIn, sessionPending, invitation, error, accepting, accept } =
    useInvitation(invitationId);

  if (sessionPending) return null;

  return (
    <AuthShell
      title="You've been invited"
      description={
        signedIn
          ? undefined
          : "Sign in, or create an account with the email address that was invited, to join."
      }
    >
      {!signedIn ? (
        <div className="flex flex-col gap-2">
          <Link
            to="/register"
            search={{ invitation: invitationId }}
            className={buttonVariants({ size: "lg" })}
          >
            Create account
          </Link>
          <Link
            to="/login"
            search={{ invitation: invitationId }}
            className={buttonVariants({ variant: "outline", size: "lg" })}
          >
            Sign in
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {invitation && (
            <p className="text-sm text-muted-foreground">
              {invitation.inviterEmail} invited you to join{" "}
              <span className="font-medium text-foreground">{invitation.organizationName}</span> as{" "}
              {ROLE_LABELS[invitation.role] ?? invitation.role}.
            </p>
          )}
          {error && (
            <p
              role="alert"
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          )}
          {invitation && (
            <Button size="lg" onClick={accept} disabled={accepting}>
              Join organization
            </Button>
          )}
        </div>
      )}
    </AuthShell>
  );
}
