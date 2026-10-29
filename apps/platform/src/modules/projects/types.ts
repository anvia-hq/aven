export type Project = {
  id: string;
  name: string;
  /** Directory that threads in this project work in, on the machine of its runtime. */
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
