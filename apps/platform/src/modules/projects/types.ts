export type Project = {
  id: string;
  name: string;
  /** Directory on the machine running control-plane that threads in this project work in. */
  projectPath: string;
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
