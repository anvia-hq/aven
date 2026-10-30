import {
  ARTIFACT_MEDIA_TYPES,
  ARTIFACT_NAME,
  type ArtifactContent,
} from "@aven/protocol/runtime-wire";
import { z } from "zod";

import { threadParams } from "../threads/schema";

// A thread and the name the runner gave one of its images; nothing else is ever a name.
export const artifactParams = threadParams.extend({ name: z.string().regex(ARTIFACT_NAME) });

// A runtime is not trusted, so what it answers is checked before it is served. Null is a runtime
// saying it has no such image.
export const artifactAnswer: z.ZodType<ArtifactContent | null> = z
  .object({
    mediaType: z.enum(ARTIFACT_MEDIA_TYPES),
    data: z.base64(),
  })
  .nullable();
