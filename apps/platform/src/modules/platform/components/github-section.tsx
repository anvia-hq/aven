import { Github } from "@mynaui/icons-react";
import { useState } from "react";

import { Button } from "@/components/button";
import { SettingsRow, SettingsSection } from "@/components/settings-section";
import { Switch } from "@/components/switch";
import { TextField } from "@/components/text-field";
import { useRequest } from "@/hooks/use-request";
import { useCreateGithubApp } from "@/modules/projects/hooks/use-create-github-app";
import type { GithubStatus } from "@/modules/projects/types";

export function GithubSection() {
  const status = useRequest<GithubStatus>("/github");
  const { create, working } = useCreateGithubApp();
  const [organization, setOrganization] = useState("");
  const [anyAccount, setAnyAccount] = useState(false);

  const github = status?.data;

  if (!github) return null;

  const { configured, canSetUp } = github;

  return (
    <SettingsSection
      title="GitHub"
      description="The GitHub App people sign in to GitHub with, and the agent opens pull requests through."
    >
      {configured && (
        <SettingsRow
          title="GitHub App is set up"
          description="People connect it to their GitHub account when they connect it. An app made private can be installed only by its owner: to install it on another organization, make it public in its settings on GitHub (Advanced > Make public)."
        />
      )}
      {!configured && !canSetUp && (
        <SettingsRow
          title="GitHub App is not set up"
          description="Set the GITHUB_APP_* variables described in .env.example."
        />
      )}
      {!configured && canSetUp && (
        <>
          <SettingsRow
            title="Create the GitHub App"
            description="GitHub asks you to confirm the app's name and permissions, then to install it. To have an organization own it, give its name."
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
