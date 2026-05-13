import { AuthEndpointError } from "./errors"

export interface AuthEndpointResponse {
  token: string
  expiresAt: string
}

export type AuthEndpointFetcher = () => Promise<AuthEndpointResponse>

export interface TokenManagerConfig {
  /** URL of the customer's token-minting endpoint. Mutually exclusive with `fetchToken`. */
  authEndpoint?: string

  /** Custom token fetcher — overrides `authEndpoint`. Useful for custom transport / headers / signing. */
  fetchToken?: AuthEndpointFetcher

  /** Optional custom headers to send with the authEndpoint request. */
  authHeaders?: Record<string, string>

  /** How many seconds before token expiry to proactively refresh. Default 30. */
  refreshLeewaySec?: number
}

interface CachedToken {
  token: string
  expiresAt: Date
}

/**
 * Owns the lifecycle of short-lived auth tokens.
 *
 * Customer's frontend either passes an `authEndpoint` URL (we POST to it) or a
 * custom `fetchToken` function (they implement). Either way, we expect back
 * `{ token, expiresAt }`. The token gets cached in-memory; we proactively
 * refresh ~30s before expiry.
 *
 * No persistent storage — the customer's authEndpoint is the source of truth.
 * Refetching on every SDK init is cheap and matches Pusher/Ably defaults.
 */
export class TokenManager {
  private readonly fetcher: AuthEndpointFetcher
  private readonly leewayMs: number
  private cached: CachedToken | null = null
  private inflight: Promise<CachedToken> | null = null

  constructor(config: TokenManagerConfig) {
    if (config.fetchToken) {
      this.fetcher = config.fetchToken
    } else if (config.authEndpoint) {
      const url = config.authEndpoint
      const headers = config.authHeaders
      this.fetcher = () => defaultFetchToken(url, headers)
    } else {
      throw new Error("TokenManager: `authEndpoint` or `fetchToken` is required")
    }
    this.leewayMs = (config.refreshLeewaySec ?? 30) * 1000
  }

  /**
   * Returns a valid token, fetching a fresh one if expired or near-expiring.
   * Coalesces concurrent calls — the first caller during a fetch makes the
   * request; subsequent callers await the same promise.
   */
  async getValidToken(): Promise<string> {
    if (this.cached && !this.isNearExpiry(this.cached)) {
      return this.cached.token
    }
    if (!this.inflight) {
      this.inflight = this.fetch().finally(() => {
        this.inflight = null
      })
    }
    const fresh = await this.inflight
    return fresh.token
  }

  /**
   * Returns ms until the token expires (taking the leeway into account).
   * Negative values mean expired or in-leeway. Used to schedule refreshes.
   */
  msUntilRefresh(): number {
    if (!this.cached) return 0
    return this.cached.expiresAt.getTime() - this.leewayMs - Date.now()
  }

  /** Force-invalidate the cached token (e.g., server told us it was revoked). */
  invalidate(): void {
    this.cached = null
  }

  /**
   * Force-fetch a new token, regardless of cache state. Used on reconnect
   * after a server-side `unauthorized` (e.g., token revoked early).
   */
  async refresh(): Promise<string> {
    this.cached = null
    return this.getValidToken()
  }

  // -------------------------------------------------------------------------

  private isNearExpiry(t: CachedToken): boolean {
    return t.expiresAt.getTime() - this.leewayMs <= Date.now()
  }

  private async fetch(): Promise<CachedToken> {
    let raw: AuthEndpointResponse
    try {
      raw = await this.fetcher()
    } catch (err) {
      throw new AuthEndpointError(
        `Failed to fetch auth token: ${(err as Error).message}`,
      )
    }
    if (!raw || typeof raw.token !== "string" || typeof raw.expiresAt !== "string") {
      throw new AuthEndpointError(
        "Auth endpoint returned malformed response (need { token, expiresAt })",
      )
    }
    const expiresAt = new Date(raw.expiresAt)
    if (Number.isNaN(expiresAt.getTime())) {
      throw new AuthEndpointError("Auth endpoint returned invalid `expiresAt`")
    }
    const cached: CachedToken = { token: raw.token, expiresAt }
    this.cached = cached
    return cached
  }
}

async function defaultFetchToken(
  url: string,
  headers?: Record<string, string>,
): Promise<AuthEndpointResponse> {
  const res = await fetch(url, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(headers ?? {}),
    },
  })
  if (!res.ok) {
    throw new Error(`Auth endpoint returned HTTP ${res.status}`)
  }
  return (await res.json()) as AuthEndpointResponse
}
