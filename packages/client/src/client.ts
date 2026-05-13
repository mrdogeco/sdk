import { Connection, DEFAULT_CONFIG, type ConnectionConfig, type ConnectionEvents } from "./connection"
import { type BackoffConfig } from "./internal/backoff"
import { TokenManager, type AuthEndpointFetcher } from "./token-manager"
import { Regions } from "./resources/regions"
import { Competitions } from "./resources/competitions"
import { Teams } from "./resources/teams"
import { Matches } from "./resources/matches"
import { Ai } from "./resources/ai"

export const DEFAULT_BASE_URL = "wss://api.mrdoge.ai/sdk/v1"

export interface MrDogeOptions {
  /**
   * Either `authEndpoint` (URL we POST to for tokens) or `fetchToken`
   * (custom async function) is required — they're mutually exclusive.
   * Customer's backend uses `@mrdoge/sdk` and `mrdoge.tokens.create()` to
   * mint tokens, then exposes them via this endpoint.
   */
  authEndpoint?: string

  /** Custom token fetcher. Use when `authEndpoint` isn't enough (custom headers, signing, etc.). */
  fetchToken?: AuthEndpointFetcher

  /** Optional custom headers added to the default `authEndpoint` POST. */
  authHeaders?: Record<string, string>

  /** Server URL override. Defaults to production. */
  baseUrl?: string

  /** Default locale applied to every call; overridable per-call. */
  locale?: string

  /** Default timezone applied to every call; overridable per-call. */
  timezone?: string

  /** Seconds before token expiry to proactively refresh. Default 30. */
  refreshLeewaySec?: number

  /** Request-level timeout in milliseconds. Default 10s. */
  requestTimeoutMs?: number

  /** Max reconnect attempts on transient disconnects. Default Infinity. */
  maxReconnectAttempts?: number

  /** Exponential backoff config for reconnects. */
  reconnectBackoff?: Partial<BackoffConfig>
}

/**
 * Mr. Doge client SDK for browsers, React Native, and edge runtimes.
 *
 * Authenticates via short-lived JWTs minted by your own backend — the SDK
 * never embeds an API key. Configure with an `authEndpoint` URL pointing at
 * your token-mint route (which uses `@mrdoge/sdk` under the hood).
 *
 * ```ts
 * import { MrDoge } from "@mrdoge/client"
 *
 * const mrdoge = new MrDoge({ authEndpoint: "/api/mrdoge/token" })
 * const matches = await mrdoge.matches.list({ date: "2026-05-13" })
 * ```
 */
export class MrDoge {
  readonly regions: Regions
  readonly competitions: Competitions
  readonly teams: Teams
  readonly matches: Matches
  readonly ai: Ai

  private readonly connection: Connection

  constructor(options: MrDogeOptions) {
    if (!options?.authEndpoint && !options?.fetchToken) {
      throw new Error(
        "MrDoge: `authEndpoint` or `fetchToken` is required. " +
          "Your customer backend exposes a token-mint route and the client SDK calls it.",
      )
    }

    const tokenManager = new TokenManager({
      authEndpoint: options.authEndpoint,
      fetchToken: options.fetchToken,
      authHeaders: options.authHeaders,
      refreshLeewaySec: options.refreshLeewaySec,
    })

    const config: ConnectionConfig = {
      baseUrl: options.baseUrl ?? DEFAULT_BASE_URL,
      tokenManager,
      locale: options.locale,
      timezone: options.timezone,
      requestTimeoutMs: options.requestTimeoutMs ?? DEFAULT_CONFIG.requestTimeoutMs,
      authTimeoutMs: DEFAULT_CONFIG.authTimeoutMs,
      maxReconnectAttempts:
        options.maxReconnectAttempts ?? DEFAULT_CONFIG.maxReconnectAttempts,
      reconnectBackoff: {
        ...DEFAULT_CONFIG.reconnectBackoff,
        ...options.reconnectBackoff,
      },
    }

    this.connection = new Connection(config)

    const defaults = { locale: options.locale, timezone: options.timezone }
    this.regions = new Regions(this.connection, defaults)
    this.competitions = new Competitions(this.connection, defaults)
    this.teams = new Teams(this.connection, defaults)
    this.matches = new Matches(this.connection, defaults)
    this.ai = new Ai(this.connection, defaults)
  }

  on<E extends keyof ConnectionEvents>(
    event: E,
    fn: (payload: ConnectionEvents[E]) => void,
  ): () => void {
    return this.connection.on(event, fn)
  }

  /** Force-open the connection now instead of waiting for the first call. */
  async connect() {
    return this.connection.connect()
  }

  /** Close the connection and cancel every active subscription. */
  async close(): Promise<void> {
    await this.connection.close()
  }
}
