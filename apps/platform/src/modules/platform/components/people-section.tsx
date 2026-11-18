import { Trash } from "@mynaui/icons-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@aven/ui/alert-dialog";
import { Avatar, AvatarFallback } from "@aven/ui/avatar";
import { Badge } from "@aven/ui/badge";
import { Button } from "@aven/ui/button";
import { SettingsList, SettingsRow } from "@/components/settings-section";
import { authClient } from "@/lib/auth-client";
import { initials, timeAgo } from "@/lib/format";

import { usePeople } from "../hooks/use-people";
import type { PlatformPerson } from "../types";

const activity = (person: PlatformPerson) =>
  person.lastActiveAt
    ? `Active ${timeAgo(person.lastActiveAt, true)}`
    : `Joined ${timeAgo(person.createdAt, true)}`;

const workspacesOf = (person: PlatformPerson) =>
  person.workspaces.length === 0
    ? "In no workspace"
    : person.workspaces.map((workspace) => `${workspace.name} (${workspace.role})`).join(", ");

function RemoveAccount({
  person,
  onRemove,
}: {
  person: PlatformPerson;
  onRemove: (person: PlatformPerson) => Promise<void>;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button variant="ghost" size="icon-sm" aria-label={`Remove account of ${person.name}`} />
        }
      >
        <Trash />
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {person.name}'s account?</AlertDialogTitle>
          <AlertDialogDescription>
            {person.email} is signed out and the account is deleted with everything that is only
            theirs: threads (anything running in them is stopped), projects they imported, bots,
            providers, skills, memory, cockpit and runners they added. A workspace they are alone in
            goes with them; in a shared workspace the others keep it. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => void onRemove(person)}>
            Remove account
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function PeopleSection() {
  const { people, error, remove } = usePeople();
  const { data: session } = authClient.useSession();

  return (
    <>
      {error && <p className="text-sm text-destructive">{error}</p>}
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
                {!person.owner && person.id !== session?.user.id && (
                  <RemoveAccount person={person} onRemove={remove} />
                )}
              </SettingsRow>
            </div>
          ))}
        </SettingsList>
      )}
    </>
  );
}
