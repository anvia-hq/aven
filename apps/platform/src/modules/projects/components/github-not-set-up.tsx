import { Github } from "@mynaui/icons-react";

import { Button } from "@/components/button";
import { useRequest } from "@/hooks/use-request";

import { useCreateGithubApp } from "../hooks/use-create-github-app";
import type { GithubStatus } from "../types";

export function GithubNotSetUp() {
  const status = useRequest<GithubStatus>("/github");
  const { create, working } = useCreateGithubApp();

  if (status?.data?.canSetUp) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-sm text-muted-foreground">
          GitHub is not set up yet. Create the GitHub App that lets Aven import repositories and
          open pull requests; GitHub asks you to confirm it. To install it on other organizations,
          create it in Settings &gt; Platform, where you can allow that.
        </p>
        <Button type="button" disabled={working} onClick={() => void create()}>
          <Github /> Create GitHub App
        </Button>
      </div>
    );
  }
  return (
    <p className="text-sm text-muted-foreground">
      GitHub is not set up on this control plane. A platform owner can set it up in Settings &gt;
      Platform, or with the <code>GITHUB_APP_*</code> variables described in{" "}
      <code>.env.example</code>.
    </p>
  );
}
