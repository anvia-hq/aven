import { atom } from "jotai";

import type { Member } from "../types";

export const membersAtom = atom<Member[]>([
  { id: "u1", name: "Indra Mushoddaq", email: "me@indrazm.com", role: "Owner", status: "active" },
  { id: "u2", name: "Sari Wulandari", email: "sari@aven.dev", role: "Admin", status: "active" },
  { id: "u3", name: "Budi Santoso", email: "budi@aven.dev", role: "Member", status: "active" },
  { id: "u4", name: "Maya Putri", email: "maya@aven.dev", role: "Viewer", status: "pending" },
]);
