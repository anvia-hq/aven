import { redirect } from "@tanstack/react-router";

import { api } from "@/lib/api";

import type { PlatformConfig } from "./types";

export async function requireOwnerSettings() {
  const config = await api<PlatformConfig>("/platform/config");

  if (!config.isOwner || config.platformSettings === false) {
    throw redirect({ to: "/settings/general" });
  }
}
