import { Button } from "@/components/button";
import { GithubMark } from "@/components/brand-icons";
import { Separator } from "@/components/separator";

import { useGithubSignIn } from "../hooks/use-github-sign-in";
import type { InvitationSearch } from "../types";

export function GithubSignIn({ invitation, divided }: InvitationSearch & { divided: boolean }) {
  const { error, pending, signIn } = useGithubSignIn({ invitation });

  return (
    <div className={divided ? "mt-4 flex flex-col gap-4" : "flex flex-col gap-4"}>
      {divided && (
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <Separator className="flex-1" />
          or
          <Separator className="flex-1" />
        </div>
      )}
      <Button type="button" variant="outline" size="lg" disabled={pending} onClick={signIn}>
        <GithubMark className="size-4" />
        Continue with GitHub
      </Button>
      {error && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
