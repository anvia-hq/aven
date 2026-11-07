export type Scope =
  | {
      kind: "workspace";
      organizationId: string;
      actorId: string;
    }
  | {
      kind: "project";
      organizationId: string;
      projectId: string;
      actorId: string;
    }
  | { kind: "personal"; organizationId: string; userId: string };
