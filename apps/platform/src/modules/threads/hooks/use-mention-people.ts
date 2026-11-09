import { isDriving } from "@aven/protocol/drivers";

import { authClient } from "@/lib/auth-client";

import type { MentionPerson } from "../types";
import { useThreads } from "./use-threads";

export function useMentionPeople(threadId: string | undefined): MentionPerson[] {
  const { threads, shared } = useThreads();
  const { data: session } = authClient.useSession();
  const { data: organization } = authClient.useActiveOrganization();
  const thread = [...threads, ...shared].find((each) => each.id === threadId);
  if (!thread || !isDriving(thread.drivingUntil)) return [];
  return (organization?.members ?? [])
    .filter((member) => member.user.id !== session?.user.id)
    .map(({ user }) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image ?? null,
    }));
}
