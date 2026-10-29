export type Project = {
  id: string;
  name: string;
  /** The runner that hosts the project's sandboxes; null on a project from before sandboxes. */
  runtimeId: string | null;
  createdAt: string;
  updatedAt: string;
};
