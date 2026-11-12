import { Github } from "@mynaui/icons-react";
import { useState } from "react";

import { Badge } from "@/components/badge";
import { Button } from "@/components/button";
import { SettingsSection } from "@/components/settings-section";
import { Switch } from "@/components/switch";
import { useRequest } from "@/hooks/use-request";
import { useCreateGithubApp } from "@/modules/projects/hooks/use-create-github-app";
import type { GithubStatus } from "@/modules/projects/types";

type Standing = { badge: string; title: string; description: string };

function standingOf({ configured, own, canSetUpWorkspace }: GithubStatus): Standing {
  if (own) {
    return {
      badge: "Own app",
      title: "This workspace has its own GitHub App",
      description:
        "Repositories are imported through it, and people connect their GitHub account to it to ship. An app made private can be installed only by its owner: to install it on another organization, make it public in its settings on GitHub (Advanced > Make public).",
    };
  }

  if (configured) {
    return {
      badge: "Platform app",
      title: "This workspace uses the platform's GitHub App",
      description:
        "The app the owner of this installation set up, shared with every workspace that has none of its own.",
    };
  }

  return {
    badge: "Not set up",
    title: "No GitHub App yet",
    description: canSetUpWorkspace
      ? "Create one for this workspace below, or ask an owner of the installation to set up the platform's."
      : "An owner or an admin of the workspace can create one, or an owner of the installation can set up the platform's.",
  };
}

export function WorkspaceGithubSection() {
  const status = useRequest<GithubStatus>("/github");
  const { create, working } = useCreateGithubApp();
  const [anyAccount, setAnyAccount] = useState(false);

  const github = status?.data;

  if (!github) return null;

  const standing = standingOf(github);

  return (
    <SettingsSection
      title="GitHub App"
      description="The GitHub App this workspace connects people to GitHub and opens pull requests through."
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3 rounded-xl border bg-card/50 p-4">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Github className="size-5" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-medium">{standing.title}</h3>
              <Badge variant={github.own || github.configured ? "secondary" : "outline"}>
                {standing.badge}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">{standing.description}</p>
          </div>
        </div>

        {github.canSetUpWorkspace && (
          <div className="flex flex-col gap-5 rounded-xl border p-4">
            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-medium">Create this workspace's own GitHub App</h3>
              <p className="text-xs text-muted-foreground">
                GitHub asks you to confirm the app's name and permissions, then to install it.
                Projects already imported keep working through the app they were imported with.
              </p>
            </div>

            <div className="flex items-center gap-4 rounded-lg bg-muted/50 p-3">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-sm font-medium">
                  Allow installing on other accounts and organizations
                </span>
                <span className="text-xs text-muted-foreground">
                  Off, only the account or organization that owns the app can install it. Turn it on
                  to install it on several organizations. Nobody can use it without this server's
                  credentials.
                </span>
              </div>
              <Switch
                aria-label="Allow installing on other accounts and organizations"
                checked={anyAccount}
                onCheckedChange={setAnyAccount}
              />
            </div>

            <div className="flex justify-end">
              <Button
                type="button"
                disabled={working}
                onClick={() =>
                  void create({
                    workspace: true,
                    public: anyAccount,
                  })
                }
              >
                <Github /> Create GitHub App
              </Button>
            </div>
          </div>
        )}
      </div>
    </SettingsSection>
  );
}
