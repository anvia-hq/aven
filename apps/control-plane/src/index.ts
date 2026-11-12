import { communityEdition } from "./edition/community";
import { startControlPlane } from "./server";

await startControlPlane(communityEdition);
