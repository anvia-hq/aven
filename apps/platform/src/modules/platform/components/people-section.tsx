import { Avatar, AvatarFallback } from "@/components/avatar";
import { Badge } from "@/components/badge";
import { SettingsList, SettingsRow, SettingsSection } from "@/components/settings-section";
import { useRequest } from "@/hooks/use-request";
import { initials, timeAgo } from "@/lib/format";

import type { PlatformPerson } from "../types";

const activity = (person: PlatformPerson) =>
  person.lastActiveAt
    ? `Active ${timeAgo(person.lastActiveAt, true)}`
    : `Joined ${timeAgo(person.createdAt, true)}`;

const workspacesOf = (person: PlatformPerson) =>
  person.workspaces.length === 0
    ? "In no workspace"
    : person.workspaces.map((workspace) => `${workspace.name} (${workspace.role})`).join(", ");

export function PeopleSection() {
  const answer = useRequest<PlatformPerson[]>("/platform/users");
  const people = answer?.data;

  return (
    <SettingsSection
      title="People"
      description="Every account on this installation, including people who are in none of your workspaces."
    >
      {answer?.error && <p className="text-sm text-destructive">{answer.error}</p>}
      {people && (
        <SettingsList label="People">
          {people.map((person) => (
            <div key={person.id} role="listitem" className="contents">
              <SettingsRow
                leading={
                  <Avatar size="sm">
                    <AvatarFallback>{initials(person.name)}</AvatarFallback>
                  </Avatar>
                }
                title={
                  <>
                    {person.name}
                    {person.owner && <Badge variant="secondary">Owner</Badge>}
                  </>
                }
                description={`${person.email} · ${workspacesOf(person)}`}
              >
                <span className="text-xs text-muted-foreground">{activity(person)}</span>
              </SettingsRow>
            </div>
          ))}
        </SettingsList>
      )}
    </SettingsSection>
  );
}
