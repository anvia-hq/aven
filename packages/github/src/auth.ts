import { GithubApiError, GithubCreateNotGrantedError } from "./errors";
import type {
  AccessTokenPayload,
  InstallationPayload,
  OAuthGrantPayload,
  UserInstallationsPayload,
  UserProfilePayload,
} from "./payload-types";
import type { GithubTransport } from "./transport";
import type { GithubUserGrant, GithubUserProfile } from "./types";

const TOKEN_MARGIN_MS = 5 * 60_000;

export class GithubAuth {
  #tokens = new Map<number, { token: string; expiresAt: number }>();

  constructor(private readonly transport: GithubTransport) {}

  clear() {
    this.#tokens.clear();
  }

  evictInstallationToken(installationId: number) {
    this.#tokens.delete(installationId);
  }

  #cachedToken(installationId: number) {
    const cached = this.#tokens.get(installationId);

    if (cached && cached.expiresAt - TOKEN_MARGIN_MS > Date.now()) return cached;

    return null;
  }

  #issueToken(installationId: number, body: Record<string, unknown>) {
    return this.transport.post<AccessTokenPayload>(
      `/app/installations/${installationId}/access_tokens`,
      this.transport.appJwt(),
      body,
    );
  }

  fetchInstallation(installationId: number) {
    return this.transport.get<InstallationPayload>(
      `/app/installations/${installationId}`,
      this.transport.appJwt(),
    );
  }

  async installationToken(installationId: number) {
    const cached = this.#cachedToken(installationId);

    if (cached) return cached;

    const issued = await this.#issueToken(installationId, {
      permissions: { contents: "read", metadata: "read" },
    });
    const entry = { token: issued.token, expiresAt: Date.parse(issued.expires_at ?? "") };
    this.#tokens.set(installationId, entry);
    return entry;
  }

  async withInstallationToken<T>(
    installationId: number,
    call: (token: string) => Promise<T>,
  ): Promise<T> {
    const fromCache = this.#cachedToken(installationId) !== null;
    const { token } = await this.installationToken(installationId);
    try {
      return await call(token);
    } catch (error) {
      if (error instanceof GithubApiError && error.status === 401) {
        this.evictInstallationToken(installationId);

        if (fromCache) {
          const fresh = await this.installationToken(installationId);
          try {
            return await call(fresh.token);
          } catch (retryError) {
            if (retryError instanceof GithubApiError && retryError.status === 401) {
              this.evictInstallationToken(installationId);
            }

            throw retryError;
          }
        }
      }

      throw error;
    }
  }

  async writeToken(installationId: number, accountLogin: string) {
    try {
      const issued = await this.#issueToken(installationId, {
        permissions: { administration: "write", contents: "write", metadata: "read" },
      });
      return issued.token;
    } catch (error) {
      if (error instanceof GithubApiError && error.status >= 400 && error.status < 500) {
        throw new GithubCreateNotGrantedError(accountLogin);
      }

      throw error;
    }
  }

  async pullReadToken(installationId: number, repoName: string) {
    try {
      const issued = await this.#issueToken(installationId, {
        repositories: [repoName],
        permissions: { pull_requests: "read", metadata: "read" },
      });
      return issued.token;
    } catch (error) {
      if (error instanceof GithubApiError && error.status === 422) return null;

      throw error;
    }
  }

  authorizeUrl(state: string) {
    const { clientId, webUrl } = this.transport.requireConfig();
    return `${webUrl}/login/oauth/authorize?${new URLSearchParams({ client_id: clientId, state })}`;
  }

  exchangeCode(code: string) {
    return this.#grant({ code });
  }

  refreshGrant(refreshToken: string) {
    return this.#grant({ grant_type: "refresh_token", refresh_token: refreshToken });
  }

  async userProfile(userToken: string): Promise<GithubUserProfile> {
    const user = await this.transport.get<UserProfilePayload>("/user", userToken);
    return { id: user.id, login: user.login, name: user.name };
  }

  async userCanUse(userToken: string, installationId: number) {
    const installations = this.transport.pages<UserInstallationsPayload, { id: number }>(
      "/user/installations",
      userToken,
      (page) => page.installations,
    );
    for await (const entry of installations) {
      if (entry.id === installationId) return true;
    }
    return false;
  }

  async #grant(params: Record<string, string>): Promise<GithubUserGrant | null> {
    const { clientId, clientSecret } = this.transport.requireConfig();
    const exchange = await this.transport.oauthPost("/login/oauth/access_token", {
      client_id: clientId,
      client_secret: clientSecret,
      ...params,
    });

    if (exchange.status >= 500) {
      throw new GithubApiError(
        `GitHub answered ${exchange.status} for POST /login/oauth/access_token`,
        exchange.status,
      );
    }

    const granted = (await exchange.json().catch(() => ({}))) as OAuthGrantPayload;

    if (!exchange.ok || !granted.access_token) return null;

    const now = Date.now();
    const after = (seconds: number | undefined) =>
      seconds !== undefined ? now + seconds * 1000 : null;
    return {
      accessToken: granted.access_token,
      expiresAt: after(granted.expires_in),
      refreshToken: granted.refresh_token ?? null,
      refreshExpiresAt: after(granted.refresh_token_expires_in),
    };
  }
}
