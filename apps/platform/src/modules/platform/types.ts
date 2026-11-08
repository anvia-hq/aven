import type { DockerLeftoverContainer, DockerLeftoverImage } from "@aven/protocol/types";

export type PlatformConfig = {
  registrationEnabled: boolean;
  isOwner: boolean;
};

export type PlatformPerson = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  createdAt: string;
  lastActiveAt: string | null;
  owner: boolean;
  workspaces: { id: string; name: string; role: string }[];
};

export type RunnerLeftovers = {
  runtimeId: string;
  name: string;
  status: "ok" | "offline" | "unsupported" | "failed";
  error?: string;
  containers: DockerLeftoverContainer[];
  images: DockerLeftoverImage[];
};

export type RemovedLeftovers = {
  removedContainers: number;
  removedImages: number;
  failed: { ref: string; reason: string }[];
};
