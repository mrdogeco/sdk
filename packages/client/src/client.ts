import { createHttpClient, type MrDogeHttpClient } from "@mrdoge/http"
import { Connection, DEFAULT_CONFIG, type ConnectionConfig, type ConnectionEvents } from "./connection"
import { type BackoffConfig } from "./internal/backoff"
import { TokenManager, type AuthEndpointFetcher } from "./token-manager"
import { Regions } from "./resources/regions"
import { Competitions } from "./resources/competitions"
import { Teams } from "./resources/teams"
import { Matches } from "./resources/matches"
import { Ai } from "./resources/ai"

export const DEFAULT_BASE_URL = "wss://api.mrdoge.co/sdk/v1"

/**
 * Derive the HTTP gateway URL from the configured WS URL by swapping the
 * scheme. Both transports sit at the same `/sdk/v1` path, so one config
 * value drives both. Falls back to leaving the URL alone for non-WS schemes
 * (lets callers pass a plain HTTPS URL if they want to).
 */
function wsToHttp(url: string): string {
  if (url.startsWith("wss://")) return "https://" + url.slice("wss://".length)
  if (url.startsWith("ws://")) return "http://" + url.slice("ws://".length)
  return url
}

export interface MrDogeOptions {
  /**
   * Either `authEndpoint` (URL we POST to for tokens) or `fetchToken`
   * (custom async function) is required — they're mutually exclusive.
   * Customer's backend uses `@mrdoge/node` and `mrdoge.tokens.create()` to
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
 * your token-mint route (which uses `@mrdoge/node` under the hood).
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
  private readonly http: MrDogeHttpClient

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

    const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL
    const requestTimeoutMs =
      options.requestTimeoutMs ?? DEFAULT_CONFIG.requestTimeoutMs

    // HTTP client shares the same TokenManager — cold-start reads
    // (regions.list, matches.trending, matches.getLive) don't pay a separate
    // token-mint, they reuse whatever WS has cached.
    this.http = createHttpClient({
      fetchToken: () => tokenManager.getValidToken(),
      baseUrl: wsToHttp(baseUrl),
      locale: options.locale,
      timezone: options.timezone,
      requestTimeoutMs,
    })

    const config: ConnectionConfig = {
      baseUrl,
      tokenManager,
      httpClient: this.http,
      locale: options.locale,
      timezone: options.timezone,
      requestTimeoutMs,
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
    this.matches = new Matches(this.connection, defaults, this.http)
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

  /**
   * Verify the connection is alive; reconnect if it isn't. Cheap and safe
   * to call on every focus/visibility/online event — no-op when the socket
   * is healthy, fires a reconnect when it's dead, wakes the backoff loop
   * when one is sleeping.
   *
   * The SDK doesn't subscribe to focus events itself (no DOM/RN runtime
   * dependency). Wire it from your platform:
   *
   * ```ts
   * // React Native
   * AppState.addEventListener("change", (s) => {
   *   if (s === "active") mrdoge.pingOrReconnect()
   * })
   *
   * // Browser / Next.js client
   * document.addEventListener("visibilitychange", () => {
   *   if (document.visibilityState === "visible") mrdoge.pingOrReconnect()
   * })
   * window.addEventListener("online", () => mrdoge.pingOrReconnect())
   * ```
   */
  async pingOrReconnect(): Promise<void> {
    return this.connection.pingOrReconnect()
  }

  /** Close the connection and cancel every active subscription. */
  async close(): Promise<void> {
    await this.connection.close()
  }
}
