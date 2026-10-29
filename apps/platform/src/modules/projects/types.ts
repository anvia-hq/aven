export type Project = {
  id: string;
  name: string;
  /** Directory on the machine running control-plane that threads in this project work in. */
  projectPath: string;
  /** The runtime the directory is on; null means the control plane's own machine. */
  runtimeId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DirectoryEntry = {
  name: string;
  path: string;
};

export type DirectoryListing = {
  path: string;
  parent: string | null;
  entries: DirectoryEntry[];
};
