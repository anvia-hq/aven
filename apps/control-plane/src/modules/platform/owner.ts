import { ForbiddenError } from "@aven/server-kit/errors";

import { platformService } from "./service";

export async function requirePlatformOwner(user: { id: string; email: string }) {
  if (!(await platformService.isOwner(user))) throw new ForbiddenError("Platform owners only");
}
