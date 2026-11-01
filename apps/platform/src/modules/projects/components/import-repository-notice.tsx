import { Github } from "@mynaui/icons-react";
import { Link } from "@tanstack/react-router";

import { Button } from "@/components/button";

import type { ImportStage } from "../types";
import { GithubNotSetUp } from "./github-not-set-up";

type Props = {
  stage: Exclude<ImportStage, { kind: "ready" }>;
  installUrl: string | null;
};

// Why the import dialog has nothing to pick from yet, and what to do about it.
export function ImportRepositoryNotice({ stage, installUrl }: Props) {
  switch (stage.kind) {
    case "failed":
      return <p className="text-sm text-destructive">{stage.message}</p>;
    case "not-configured":
      return <GithubNotSetUp />;
    case "connect":
      return (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-muted-foreground">
            Connect a GitHub account to choose from its repositories.
          </p>
          {installUrl && (
            <Button nativeButton={false} render={<a href={installUrl} />}>
              <Github /> Connect GitHub
            </Button>
          )}
        </div>
      );
    case "no-runner":
      return (
        <p className="text-sm text-muted-foreground">
          A project needs a runner to host its sandboxes.{" "}
          <Link to="/settings/runtimes" className="underline">
            Add a runner
          </Link>{" "}
          first.
        </p>
      );
  }
}
