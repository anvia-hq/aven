import { Github } from "@mynaui/icons-react";
import { useState } from "react";

import { Button } from "@/components/button";
import { SettingsRow, SettingsSection } from "@/components/settings-section";
import { Switch } from "@/components/switch";
import { TextField } from "@/components/text-field";
import { useRequest } from "@/hooks/use-request";
import { useCreateGithubApp } from "@/modules/projects/hooks/use-create-github-app";
import type { GithubStatus } from "@/modules/projects/types";

export function WorkspaceGithubSection() {
  const status = useRequest<GithubStatus>("/github");
  const { create, working } = useCreateGithubApp();
  const [organization, setOrganization] = useState("");
  const [anyAccount, setAnyAccount] = useState(false);

  const github = status?.data;
  if (!github) return null;
  const { configured, own, canSetUpWorkspace } = github;

  return (
    <SettingsSection
      title="GitHub App"
      description="The GitHub App this workspace imports repositories and opens pull requests through."
    >
      {own && (
        <SettingsRow
          title="This workspace has its own GitHub App"
          description="Repositories are imported through it, and people connect their GitHub account to it to ship. An app made private can be installed only by its owner: to install it on another organization, make it public in its settings on GitHub (Advanced > Make public)."
        />
      )}
      {!own && configured && (
        <SettingsRow
          title="This workspace uses the platform's GitHub App"
          description="The app the owner of this installation set up, shared with every workspace that has none of its own."
        />
      )}
      {!own && !configured && (
        <SettingsRow
          title="No GitHub App yet"
          description={
            canSetUpWorkspace
              ? "Create one for this workspace below, or ask an owner of the installation to set up the platform's."
              : "An owner or an admin of the workspace can create one, or an owner of the installation can set up the platform's."
          }
        />
      )}
      {canSetUpWorkspace && (
        <>
          <SettingsRow
            title="Create this workspace's own GitHub App"
            description="GitHub asks you to confirm the app's name and permissions, then to install it. To have a GitHub organization own it, give its name. Repositories already imported keep working through the app they were imported with."
          >
            <div className="flex items-end gap-2">
              <TextField
                label="Organization (optional)"
                placeholder="acme"
                value={organization}
                onChange={(event) => setOrganization(event.target.value)}
              />
              <Button
                type="button"
                disabled={working}
                onClick={() =>
                  void create({
                    workspace: true,
                    organization: organization.trim() || undefined,
                    public: anyAccount,
                  })
                }
              >
                <Github /> Create GitHub App
              </Button>
            </div>
          </SettingsRow>
          <SettingsRow
            title="Allow installing on other accounts and organizations"
            description="Off, only the account or organization that owns the app can install it. Turn it on to install it on several organizations. Nobody can use it without this server's credentials."
          >
            <Switch
              aria-label="Allow installing on other accounts and organizations"
              checked={anyAccount}
              onCheckedChange={setAnyAccount}
            />
          </SettingsRow>
        </>
      )}
    </SettingsSection>
  );
}
