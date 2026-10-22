import { useAtom } from "jotai";

import { toast } from "@/components/toast";

import { membersAtom } from "../atoms/members-atom";
import type { Role } from "../types";

export function useMembers() {
  const [members, setMembers] = useAtom(membersAtom);

  function invite(email: string, role: Role) {
    setMembers((all) => [
      ...all,
      {
        id: `u-${Math.random().toString(36).slice(2, 8)}`,
        name: email.split("@")[0] ?? email,
        email,
        role,
        status: "pending",
      },
    ]);
    toast.add({ title: "Invitation sent", description: email, type: "success" });
  }

  function remove(id: string, name: string) {
    setMembers((all) => all.filter((member) => member.id !== id));
    toast.add({ title: "Member removed", description: name });
  }

  return { members, invite, remove };
}
