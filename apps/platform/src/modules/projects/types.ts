export type Commit = {
  hash: string;
  message: string;
  author: string;
  at: string;
  ci: "pass" | "fail" | null;
};

export type FileEntry = {
  name: string;
  type: "dir" | "file";
  message: string;
  at: string;
};

export type Project = {
  id: string;
  name: string;
  repo: string;
  description: string;
  language: string;
  defaultBranch: string;
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
  commits: Commit[];
  files: FileEntry[];
};
