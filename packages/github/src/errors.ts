import { ConflictError, UnavailableError } from "@aven/server-kit/errors";

export class GithubNotConfiguredError extends UnavailableError {
  constructor() {
    super("GitHub is not configured on this control plane");
  }
}

export class GithubWriteNotGrantedError extends ConflictError {
  constructor(accountLogin: string) {
    super(
      `The Aven app has not been approved to write to ${accountLogin} on GitHub. Approve its new permissions there, then try again.`,
    );
  }
}

export class GithubIssuesNotGrantedError extends ConflictError {
  constructor(accountLogin: string) {
    super(
      `The Aven app has not been approved to read issues on ${accountLogin} on GitHub. Approve its new permissions there to list them here.`,
    );
  }
}

export class GithubNoPushAccessError extends ConflictError {
  constructor(fullName: string) {
    super(`You do not have write access to ${fullName} on GitHub`);
  }
}

export class GithubCreateNotGrantedError extends ConflictError {
  constructor(accountLogin: string) {
    super(
      `The Aven app has not been approved to create repositories on ${accountLogin} on GitHub. Approve its new permissions there, then try again.`,
    );
  }
}

export class GithubRepositoryNotCreatedError extends ConflictError {
  constructor(fullName: string) {
    super(
      `GitHub did not create ${fullName}. The name may be taken there, or that account may not let the app create repositories.`,
    );
  }
}

export class GithubUserRequiredError extends ConflictError {
  constructor() {
    super("Connect GitHub to create a repository in your own account, then try again");
  }
}

export class GithubApiError extends UnavailableError {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export function nullWhenNotFound(error: unknown): null {
  if (error instanceof GithubApiError && error.status === 404) return null;

  throw error;
}

export function fallbackOnStatuses<T>(statuses: readonly number[], fallback: T) {
  return (error: unknown): T => {
    if (error instanceof GithubApiError && statuses.includes(error.status)) return fallback;

    throw error;
  };
}
