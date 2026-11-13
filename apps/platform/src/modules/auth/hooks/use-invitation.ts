import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { toast } from "@aven/ui/toast";
import { authClient } from "@/lib/auth-client";

type Invitation = {
  organizationName: string;
  inviterEmail: string;
  role: string;
};

export function useInvitation(invitationId: string) {
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const navigate = useNavigate();
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const signedIn = Boolean(session);

  useEffect(() => {
    if (!signedIn) return;

    let current = true;
    authClient.organization.getInvitation({ query: { id: invitationId } }).then(
      (result) => {
        if (!current) return;

        if (result.error) setError(result.error.message ?? "This invitation is not valid");
        else setInvitation(result.data);
      },
      () => {
        if (current) setError("Could not reach the server");
      },
    );
    return () => {
      current = false;
    };
  }, [signedIn, invitationId]);

  async function accept() {
    setError(null);
    setAccepting(true);
    const result = await authClient.organization.acceptInvitation({ invitationId });

    if (result.error) {
      setError(result.error.message ?? "Could not accept the invitation");
      setAccepting(false);
      return;
    }

    await authClient.organization.setActive({
      organizationId: result.data.invitation.organizationId,
    });
    toast.add({ title: "Joined organization", description: invitation?.organizationName });
    await navigate({ to: "/threads" });
  }

  return { signedIn, sessionPending, invitation, error, accepting, accept };
}
