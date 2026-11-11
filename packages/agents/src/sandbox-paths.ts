import type { SandboxPaths } from "./types";

export const SANDBOX_PATHS: SandboxPaths = {
  workspace: "/workspace",
  uploads: "/uploads",
  skills: "/skills",
};

export function forPaths(text: string, paths: SandboxPaths) {
  return text.replace(
    /(?<![\w./-])\/(workspace|uploads|skills)(?![\w-])/g,
    (_, name: keyof SandboxPaths) => String(paths[name]),
  );
}
