export type PlatformConfig = {
  registrationEnabled: boolean;
  githubLogin: boolean;
  emailLogin: boolean;
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
