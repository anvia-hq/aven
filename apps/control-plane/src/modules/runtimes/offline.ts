import { UnavailableError } from "@aven/server-kit/errors";

export class RuntimeOfflineError extends UnavailableError {
  constructor(message = "The runtime for this project is offline") {
    super(message);
  }
}
