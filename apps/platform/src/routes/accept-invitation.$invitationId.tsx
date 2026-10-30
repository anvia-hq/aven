import { createFileRoute, Link } from "@tanstack/react-router";

import { Button, buttonVariants } from "@/components/button";
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
    <main className="mx-auto flex min-h-screen max-w-xs flex-col justify-center gap-4 p-4">
      <h1 className="text-lg font-semibold">You've been invited</h1>
      {!signedIn ? (
        <>
          <p className="text-sm text-muted-foreground">
            Sign in, or create an account with the email address that was invited, to join.
          </p>
          <div className="flex gap-2">
            <Link to="/register" search={{ invitation: invitationId }} className={buttonVariants()}>
              Create account
            </Link>
            <Link
              to="/login"
              search={{ invitation: invitationId }}
              className={buttonVariants({ variant: "outline" })}
            >
              Sign in
            </Link>
          </div>
        </>
      ) : (
        <>
          {invitation && (
            <p className="text-sm text-muted-foreground">
              {invitation.inviterEmail} invited you to join{" "}
              <span className="font-medium text-foreground">{invitation.organizationName}</span> as{" "}
              {ROLE_LABELS[invitation.role] ?? invitation.role}.
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {invitation && (
            <Button onClick={accept} disabled={accepting} className="self-start">
              Join organization
            </Button>
          )}
        </>
      )}
    </main>
  );
}
