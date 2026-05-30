import { createHttpClient, type MrDogeHttpClient } from "@mrdoge/http"
import { Connection, DEFAULT_CONFIG, type ConnectionConfig, type ConnectionEvents } from "./connection"
import { type BackoffConfig } from "./internal/backoff"
import { Regions } from "./resources/regions"
import { Competitions } from "./resources/competitions"
import { Teams } from "./resources/teams"
import { Matches } from "./resources/matches"
import { Odds } from "./resources/odds"
import { Ai } from "./resources/ai"
import { Tokens } from "./resources/tokens"

export const DEFAULT_BASE_URL = "wss://api.mrdoge.co/sdk/v1"

/**
 * Derive the HTTP gateway URL from the configured WS URL by swapping the
 * scheme. One `baseUrl` config drives both transports.
 */
function wsToHttp(url: string): string {
  if (url.startsWith("wss://")) return "https://" + url.slice("wss://".length)
  if (url.startsWith("ws://")) return "http://" + url.slice("ws://".length)
  return url
}

export interface MrDogeOptions {
  apiKey: string

  /** Override the server URL (e.g. for local dev). Defaults to production. */
  baseUrl?: string

  /** Default locale applied to every call; overridable per-call. */
  locale?: string

  /** Default timezone applied to every call; overridable per-call. */
  timezone?: string

  /** Request-level timeout in milliseconds. Default 10s. */
  requestTimeoutMs?: number

  /** Max reconnect attempts on transient disconnects. Default Infinity. */
  maxReconnectAttempts?: number

  /** Exponential backoff config for reconnects. */
  reconnectBackoff?: Partial<BackoffConfig>

  /**
   * Whether to negotiate `permessage-deflate` compression at the WS handshake.
   * Default `true`. Disable for CPU-constrained environments.
   */
  compression?: boolean
}

/**
 * Mr. Doge SDK entrypoint.
 *
 * ```ts
 * const mrdoge = new MrDoge({ apiKey: process.env.MRDOGE_API_KEY! })
 * const matches = await mrdoge.matches.list({ date: "2026-05-12" })
 * ```
 *
 * The constructor does not open a connection. The WebSocket is opened lazily
 * on the first method call and reused for the lifetime of the client.
 */
export class MrDoge {
  readonly regions: Regions
  readonly competitions: Competitions
  readonly teams: Teams
  readonly matches: Matches
  readonly odds: Odds
  readonly ai: Ai
  readonly tokens: Tokens

  private readonly connection: Connection
  private readonly http: MrDogeHttpClient

  constructor(options: MrDogeOptions) {
    if (!options?.apiKey) throw new Error("MrDoge: `apiKey` is required")

    const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL
    const requestTimeoutMs =
      options.requestTimeoutMs ?? DEFAULT_CONFIG.requestTimeoutMs

    this.http = createHttpClient({
      apiKey: options.apiKey,
      baseUrl: wsToHttp(baseUrl),
      locale: options.locale,
      timezone: options.timezone,
      requestTimeoutMs,
    })

    const config: ConnectionConfig = {
      ...DEFAULT_CONFIG,
      baseUrl,
      apiKey: options.apiKey,
      httpClient: this.http,
      locale: options.locale,
      timezone: options.timezone,
      requestTimeoutMs,
      maxReconnectAttempts:
        options.maxReconnectAttempts ?? DEFAULT_CONFIG.maxReconnectAttempts,
      reconnectBackoff: {
        ...DEFAULT_CONFIG.reconnectBackoff,
        ...options.reconnectBackoff,
      },
      compression: options.compression ?? DEFAULT_CONFIG.compression,
    }

    this.connection = new Connection(config)

    const defaults = { locale: options.locale, timezone: options.timezone }
    this.regions = new Regions(this.connection, defaults)
    this.competitions = new Competitions(this.connection, defaults)
    this.teams = new Teams(this.connection, defaults)
    this.matches = new Matches(this.connection, defaults, this.http)
    this.odds = new Odds(this.connection, defaults)
    this.ai = new Ai(this.connection, defaults)
    this.tokens = new Tokens(this.connection)
  }

  /**
   * Listen to connection lifecycle events.
   */
  on<E extends keyof ConnectionEvents>(
    event: E,
    fn: (payload: ConnectionEvents[E]) => void,
  ): () => void {
    return this.connection.on(event, fn)
  }

  /**
   * Force-open the connection now instead of waiting for the first call.
   * Returns the welcome payload from the server.
   */
  async connect() {
    return this.connection.connect()
  }

  /**
   * Close the connection and cancel every active subscription. The client is
   * unusable after `close()`.
   */
  async close(): Promise<void> {
    await this.connection.close()
  }
}
