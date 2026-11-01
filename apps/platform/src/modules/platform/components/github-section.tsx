import { Github } from "@mynaui/icons-react";
import { useState } from "react";

import { Button } from "@/components/button";
import { SettingsRow, SettingsSection } from "@/components/settings-section";
import { TextField } from "@/components/text-field";
import { useRequest } from "@/hooks/use-request";
import { useCreateGithubApp } from "@/modules/projects/hooks/use-create-github-app";
import type { GithubStatus } from "@/modules/projects/types";

// Whether Aven has a GitHub App, which projects are imported through (decision 0013), and for an
// owner the way to create it (decision 0074).
export function GithubSection() {
  const status = useRequest<GithubStatus>("/github");
  const { create, working } = useCreateGithubApp();
  const [organization, setOrganization] = useState("");

  const github = status?.data;
  if (!github) return null;
  const { configured, canSetUp } = github;

  return (
    <SettingsSection
      title="GitHub"
      description="The GitHub App that imports repositories and opens pull requests."
    >
      {configured ? (
        <SettingsRow
          title="GitHub App is set up"
          description="People connect it to their GitHub account when they import a repository."
        />
      ) : (
        <SettingsRow
          title="Create the GitHub App"
          description={
            canSetUp
              ? "GitHub asks you to confirm the app's name and permissions, then to install it. To have an organization own it, give its name."
              : "Not set up. Set the GITHUB_APP_* variables described in .env.example."
          }
        >
          {canSetUp && (
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
                onClick={() => void create(organization.trim() || undefined)}
              >
                <Github /> Create GitHub App
              </Button>
            </div>
          )}
        </SettingsRow>
      )}
    </SettingsSection>
  );
}
