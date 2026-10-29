export type Project = {
  id: string;
  name: string;
  /** The runner that hosts the project's sandboxes. */
  runtimeId: string;
  createdAt: string;
  updatedAt: string;
};
