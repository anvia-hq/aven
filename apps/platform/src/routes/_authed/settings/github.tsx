import { Github } from "@mynaui/icons-react";
import { createFileRoute } from "@tanstack/react-router";

import { Button } from "@aven/ui/button";
import { SettingsPage, SettingsRow, SettingsSection } from "@/components/settings-section";
import { useRequest } from "@/hooks/use-request";
import { useGithubAccount } from "@/modules/projects/hooks/use-github-account";
import type { GithubStatus } from "@/modules/projects/types";

export const Route = createFileRoute("/_authed/settings/github")({
  component: GithubSettings,
});

function GithubSettings() {
  const status = useRequest<GithubStatus>("/github");
  const account = useGithubAccount();
  const github = status?.data;

  return (
    <SettingsPage title="GitHub" description="How this workspace reaches GitHub.">
      {github && (
        <SettingsSection
          title="GitHub App"
          description="The GitHub App this server connects people to GitHub and opens pull requests through."
        >
          {github.configured ? (
            <>
              <SettingsRow
                title="Install it on a GitHub account"
                description="Repositories are imported from the accounts and organizations the app is installed on."
              >
                {github.installUrl && (
                  <Button
                    nativeButton={false}
                    variant="outline"
                    render={<a href={github.installUrl} />}
                  >
                    <Github /> Install on GitHub
                  </Button>
                )}
              </SettingsRow>
              <SettingsRow
                title={
                  account?.data?.connected
                    ? `Connected as @${account.data.login}`
                    : "Connect your GitHub account"
                }
                description="Your account is what the agent acts as on GitHub when it ships your work."
              >
                <Button
                  nativeButton={false}
                  variant="outline"
                  render={<a href="/api/github/connect?next=/settings/github" />}
                >
                  <Github /> {account?.data?.connected ? "Reconnect" : "Connect GitHub"}
                </Button>
              </SettingsRow>
            </>
          ) : (
            <SettingsRow
              title="GitHub App is not set up"
              description={
                github.canSetUp
                  ? "Create it in the platform settings."
                  : "An owner of this installation sets it up in the platform settings."
              }
            />
          )}
        </SettingsSection>
      )}
    </SettingsPage>
  );
}
