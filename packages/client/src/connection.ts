import {
  PROTOCOL_VERSION,
  SUBPROTOCOL,
  type MethodName,
  type MethodParams,
  type MethodResult,
  type WelcomeParams,
  type SubscriptionEventParams,
  type SubscriptionClosedParams,
  type RpcRequest,
} from "@mrdoge/protocol"
import type { HttpMethodName, MrDogeHttpClient } from "@mrdoge/http"
import {
  AbortError,
  ConnectionError,
  DisconnectedError,
  TimeoutError,
  UnauthorizedError,
  rpcErrorToTyped,
  MrDogeError,
} from "./errors"

/**
 * Per-call options accepted by every method that makes a request. Mirrors
 * the `fetch` convention so customers can plug in a standard `AbortController`.
 *
 * When `signal` fires, the in-flight request is dropped client-side and the
 * returned promise rejects with `AbortError` (`err.name === "AbortError"`).
 * The frame may have already been sent — the server may still process and
 * reply, but the response is discarded.
 */
export interface CallOptions {
  signal?: AbortSignal
}

/**
 * Options for `listAll` cursor-walk helpers. Aborting via `signal` cancels
 * the in-flight page; the helper rethrows the `AbortError`. `onPage` fires
 * after every page lands — pass it to render partial results progressively
 * (e.g., paint the first page in your UI while later pages keep arriving).
 */
export interface ListAllOptions<T> extends CallOptions {
  onPage?: (page: T[], accumulated: T[]) => void
}
import { Emitter } from "./internal/emitter"
import { DEFAULT_BACKOFF, type BackoffConfig, nextDelay } from "./internal/backoff"
import { TokenManager } from "./token-manager"

const TERMINAL_CLOSE_CODES = new Set([4001, 4002, 4003, 4029])

export interface ConnectionConfig {
  baseUrl: string
  tokenManager: TokenManager
  /**
   * HTTP client used as the cold-start fast path. When `call()` fires
   * before the WebSocket is open, it routes through this client so reads
   * don't pay the WS handshake latency. Subscriptions still always use WS.
   */
  httpClient: MrDogeHttpClient
  locale?: string
  timezone?: string
  requestTimeoutMs: number
  authTimeoutMs: number
  maxReconnectAttempts: number
  reconnectBackoff: BackoffConfig
}

export const DEFAULT_CONFIG = {
  requestTimeoutMs: 10_000,
  authTimeoutMs: 10_000,
  maxReconnectAttempts: Infinity,
  reconnectBackoff: DEFAULT_BACKOFF,
} as const

export interface ConnectionEvents {
  connected: { welcome: WelcomeParams }
  disconnected: { reason: string; code: number }
  reconnecting: { attempt: number; delayMs: number }
}

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (err: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export interface SubscriptionRegistration {
  subId: string
  method: MethodName
  params: unknown
  onEvent: (event: SubscriptionEventParams) => void
  onClosed: (params: SubscriptionClosedParams) => void
  onSnapshot: (newSubId: string, snapshot: unknown) => void
}

/**
 * Browser-native WebSocket connection with token-based auth.
 *
 * Differences vs the Node SDK's Connection:
 * - Uses global `WebSocket` (browser/RN/edge), not Node's `ws` package
 * - Auth handshake sends `{ token }` instead of `{ apiKey }`
 * - Pulls tokens from a `TokenManager` (which calls the customer's authEndpoint)
 * - Schedules proactive token refresh; on expiry, soft-reconnects with new token
 * - No `permessage-deflate` (RN's WS doesn't support it; browser auto-negotiates)
 */
export class Connection {
  private readonly emitter = new Emitter<ConnectionEvents>()
  private readonly config: ConnectionConfig
  private ws: WebSocket | null = null
  private nextRequestId = 1
  private readonly pending = new Map<string, PendingRequest>()
  private readonly subscriptions = new Map<string, SubscriptionRegistration>()
  private connectingPromise: Promise<WelcomeParams> | null = null
  private welcome: WelcomeParams | null = null
  private closed = false
  private reconnectAttempt = 0
  private reconnectAbort: AbortController | null = null
  private reconnectWakeUp: (() => void) | null = null
  private refreshTimer: ReturnType<typeof setTimeout> | null = null
  private pendingWelcome: PendingRequest | null = null

  constructor(config: ConnectionConfig) {
    this.config = config
  }

  on = this.emitter.on.bind(this.emitter)
  off = this.emitter.off.bind(this.emitter)

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN && this.welcome !== null
  }

  async connect(): Promise<WelcomeParams> {
    if (this.closed) throw new ConnectionError("Connection is closed")
    if (this.welcome && this.ws?.readyState === WebSocket.OPEN) return this.welcome
    if (this.connectingPromise) return this.connectingPromise

    this.connectingPromise = this.openAndAuth().finally(() => {
      this.connectingPromise = null
    })
    return this.connectingPromise
  }

  /**
   * Verify the connection is alive; reconnect if it isn't. Cheap and safe to
   * call on every focus/visibility/online event — no-op when the socket is
   * healthy, fires a reconnect when it's dead, wakes the backoff loop when
   * one is sleeping.
   *
   * Wire from your platform's focus signal — the SDK has no DOM/RN runtime
   * dependency and can't subscribe to these events on its own:
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
   *
   * Never throws — failures fall through to the normal reconnect machinery
   * (or to the next call if no subscriptions are active).
   */
  async pingOrReconnect(): Promise<void> {
    if (this.closed) return

    // Healthy state — nothing to do.
    if (this.ws?.readyState === WebSocket.OPEN && this.welcome !== null) return

    // Reconnect loop is sleeping in backoff — wake it up so we don't wait
    // out a stale delay (e.g. the device emerged from a network drop while
    // the loop was 30s into a backoff). Reset the attempt counter so any
    // post-wake-up retries start from the min delay: the consumer just
    // signalled an app-context change, which makes the prior failure
    // streak stale.
    if (this.reconnectWakeUp) {
      this.reconnectAttempt = 0
      const wake = this.reconnectWakeUp
      this.reconnectWakeUp = null
      wake()
      return
    }

    // Reconnect loop is active but mid-attempt (not currently sleeping) —
    // let it finish. Two concurrent openAndAuth calls would race.
    if (this.reconnectAbort) return

    // Initial connect already in flight — let it finish.
    if (this.connectingPromise) {
      try {
        await this.connectingPromise
      } catch {
        // ignore — consumer will retry on the next focus event
      }
      return
    }

    // No connect/reconnect in flight and the WS is bad — kick one off.
    // `connect()` dedups against any concurrent caller via `connectingPromise`.
    try {
      await this.connect()
    } catch {
      // Connect failed. If subscriptions exist, handleClose will engage the
      // reconnect machinery; otherwise the consumer can retry on the next
      // focus event.
    }
  }

  async call<M extends MethodName>(
    method: M,
    params: MethodParams<M>,
    options?: CallOptions,
  ): Promise<MethodResult<M>> {
    if (this.closed) {
      return Promise.reject(new DisconnectedError("Client closed"))
    }
    // If WS isn't open, route reads through HTTP — saves the WS handshake
    // (~1s+) on cold start. Only customer-facing reads reach `call()`;
    // auth + subscription.cancel use `send()` directly. Subscriptions go
    // through `registerSubscription` which always opens WS.
    if (this.ws?.readyState !== WebSocket.OPEN) {
      return this.config.httpClient.call(
        method as HttpMethodName,
        params as MethodParams<HttpMethodName>,
        options,
      ) as Promise<MethodResult<M>>
    }
    return this.send(method, params, options) as Promise<MethodResult<M>>
  }

  async registerSubscription<M extends MethodName>(
    method: M,
    params: MethodParams<M>,
    handlers: {
      onEvent: SubscriptionRegistration["onEvent"]
      onClosed: SubscriptionRegistration["onClosed"]
      onSnapshot: SubscriptionRegistration["onSnapshot"]
    },
    options?: CallOptions,
  ): Promise<{ subId: string; snapshot: unknown }> {
    await this.connect()
    const result = (await this.send(method, params, options)) as { sub: string; snapshot: unknown }
    const reg: SubscriptionRegistration = {
      subId: result.sub,
      method,
      params,
      onEvent: handlers.onEvent,
      onClosed: handlers.onClosed,
      onSnapshot: handlers.onSnapshot,
    }
    this.subscriptions.set(result.sub, reg)
    return { subId: result.sub, snapshot: result.snapshot }
  }

  async cancelSubscription(subId: string): Promise<void> {
    const reg = this.subscriptions.get(subId)
    if (!reg) return
    this.subscriptions.delete(subId)
    if (this.ws?.readyState === WebSocket.OPEN) {
      try {
        await this.send("subscription.cancel" as MethodName, { sub: subId } as never)
      } catch {
        // Best-effort.
      }
    }
  }

  async close(): Promise<void> {
    this.closed = true
    this.reconnectAbort?.abort()
    this.reconnectAbort = null
    this.clearRefreshTimer()
    for (const [, p] of this.pending) {
      clearTimeout(p.timer)
      p.reject(new DisconnectedError("Connection closed by client"))
    }
    this.pending.clear()
    this.subscriptions.clear()
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) {
      try {
        this.ws.close(1000, "client_close")
      } catch {
        // ignore
      }
    }
    this.ws = null
    this.welcome = null
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private async openAndAuth(): Promise<WelcomeParams> {
    const token = await this.config.tokenManager.getValidToken()
    const ws = new WebSocket(this.config.baseUrl, [SUBPROTOCOL])
    this.ws = ws
    this.welcome = null

    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        ws.removeEventListener("open", onOpen)
        ws.removeEventListener("error", onError)
        ws.removeEventListener("close", onClose)
      }
      const onOpen = () => {
        cleanup()
        resolve()
      }
      const onError = (_ev: Event) => {
        cleanup()
        reject(new ConnectionError("Failed to open WebSocket"))
      }
      const onClose = (ev: CloseEvent) => {
        cleanup()
        reject(
          new ConnectionError(
            `WebSocket closed before open (${ev.code}): ${ev.reason || "no reason"}`,
          ),
        )
      }
      ws.addEventListener("open", onOpen)
      ws.addEventListener("error", onError)
      ws.addEventListener("close", onClose)
    })

    ws.addEventListener("message", (ev) => this.handleMessage(ev.data))
    ws.addEventListener("close", (ev) => this.handleClose(ws, ev.code, ev.reason))
    ws.addEventListener("error", () => this.handleSocketError())

    const welcome = await this.performAuth(token)
    this.welcome = welcome
    this.reconnectAttempt = 0
    this.scheduleTokenRefresh()
    this.emitter.emit("connected", { welcome })

    if (this.subscriptions.size > 0) {
      await this.resubscribeAll()
    }
    return welcome
  }

  private async performAuth(token: string): Promise<WelcomeParams> {
    const welcomePromise = new Promise<WelcomeParams>((resolve, reject) => {
      const timer = setTimeout(() => {
        // Force-close the WS so it doesn't linger in a half-authed limbo
        // state (ws.readyState === OPEN but welcome === null). Without this,
        // subsequent `send()` calls would dispatch frames the server has
        // dropped, and `call()`'s `readyState !== OPEN` HTTP fallback never
        // engages.
        this.pendingWelcome = null
        try {
          this.ws?.close(4000, "auth_timeout")
        } catch {
          // ignore
        }
        reject(new TimeoutError("Auth timed out waiting for welcome"))
      }, this.config.authTimeoutMs)
      this.pendingWelcome = {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
      }
    })

    const authAck = this.send("auth" as MethodName, { token } as never).catch(
      (err: Error) => {
        if (err instanceof MrDogeError) throw err
        throw new UnauthorizedError(`Authentication failed: ${err.message}`)
      },
    )

    await authAck
    return welcomePromise
  }

  private send(
    method: string,
    params: unknown,
    options?: CallOptions,
  ): Promise<unknown> {
    if (options?.signal?.aborted) {
      return Promise.reject(new AbortError())
    }
    const ws = this.ws
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new DisconnectedError("Socket not open"))
    }
    const id = String(this.nextRequestId++)
    const frame: RpcRequest = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    }
    return new Promise((resolve, reject) => {
      const onAbort = () => {
        this.pending.delete(id)
        clearTimeout(timer)
        options!.signal!.removeEventListener("abort", onAbort)
        reject(new AbortError())
      }
      const detachSignal = () => {
        options?.signal?.removeEventListener("abort", onAbort)
      }
      const wrappedResolve = (val: unknown) => {
        detachSignal()
        resolve(val)
      }
      const wrappedReject = (err: Error) => {
        detachSignal()
        reject(err)
      }
      const timer = setTimeout(() => {
        this.pending.delete(id)
        detachSignal()
        reject(new TimeoutError(`Request "${method}" timed out after ${this.config.requestTimeoutMs}ms`))
      }, this.config.requestTimeoutMs)
      this.pending.set(id, { resolve: wrappedResolve, reject: wrappedReject, timer })
      options?.signal?.addEventListener("abort", onAbort)
      try {
        ws.send(JSON.stringify(frame))
      } catch (err) {
        this.pending.delete(id)
        clearTimeout(timer)
        detachSignal()
        reject(new ConnectionError(`Failed to send frame: ${(err as Error).message}`))
      }
    })
  }

  private handleMessage(raw: unknown): void {
    let text: string
    if (typeof raw === "string") {
      text = raw
    } else if (raw instanceof ArrayBuffer) {
      text = new TextDecoder().decode(new Uint8Array(raw))
    } else {
      // Unknown frame type (e.g. Blob in some browsers if binaryType is wrong).
      // We never request binary frames; skip.
      return
    }

    let frame: any
    try {
      frame = JSON.parse(text)
    } catch {
      return
    }
    if (frame.jsonrpc !== "2.0") return

    if (typeof frame.id === "string") {
      const p = this.pending.get(frame.id)
      if (!p) return
      this.pending.delete(frame.id)
      clearTimeout(p.timer)
      if (frame.error) {
        p.reject(rpcErrorToTyped(frame.error))
      } else {
        p.resolve(frame.result)
      }
      return
    }

    if (typeof frame.method === "string") {
      this.handleNotification(frame.method, frame.params)
    }
  }

  private handleNotification(method: string, params: unknown): void {
    if (method === "welcome") {
      const pending = this.pendingWelcome
      this.pendingWelcome = null
      if (pending) {
        clearTimeout(pending.timer)
        pending.resolve(params as WelcomeParams)
      }
      return
    }
    if (method === "subscription.event") {
      const p = params as SubscriptionEventParams
      const reg = this.subscriptions.get(p.sub)
      reg?.onEvent(p)
      return
    }
    if (method === "subscription.closed") {
      const p = params as SubscriptionClosedParams
      const reg = this.subscriptions.get(p.sub)
      if (reg) {
        this.subscriptions.delete(p.sub)
        reg.onClosed(p)
      }
      return
    }
    // Unknown notification → ignore (additive-future-changes rule).
  }

  private handleClose(closedWs: WebSocket, code: number, reason: string): void {
    // Ignore stale close events for sockets that have already been replaced.
    // Can happen after an auth-timeout forces a close: by the time the close
    // event lands in the event loop, the reconnect loop may have already
    // opened a fresh socket and assigned it to `this.ws`. Without this
    // guard, the stale close nulls out the new socket's reference.
    if (this.ws !== null && this.ws !== closedWs) return

    const wasConnected = this.welcome !== null
    this.welcome = null
    this.ws = null
    this.clearRefreshTimer()

    for (const [, p] of this.pending) {
      clearTimeout(p.timer)
      p.reject(new DisconnectedError(`Connection closed (${code}): ${reason}`))
    }
    this.pending.clear()
    if (this.pendingWelcome) {
      clearTimeout(this.pendingWelcome.timer)
      this.pendingWelcome.reject(
        new DisconnectedError(`Connection closed during auth (${code})`),
      )
      this.pendingWelcome = null
    }

    if (this.closed) return
    this.emitter.emit("disconnected", { code, reason })

    if (TERMINAL_CLOSE_CODES.has(code)) {
      this.closed = true
      return
    }

    if (wasConnected || this.subscriptions.size > 0) {
      this.scheduleReconnect()
    }
  }

  private handleSocketError(): void {
    // `close` always follows; let handleClose drive reconnection.
  }

  private async scheduleReconnect(): Promise<void> {
    if (this.closed) return
    if (this.reconnectAbort) return
    this.reconnectAbort = new AbortController()
    const signal = this.reconnectAbort.signal

    try {
      while (!this.closed && this.reconnectAttempt < this.config.maxReconnectAttempts) {
        this.reconnectAttempt += 1
        const delayMs = nextDelay(this.reconnectAttempt, this.config.reconnectBackoff)
        this.emitter.emit("reconnecting", { attempt: this.reconnectAttempt, delayMs })

        const outcome = await this.waitForReconnectAttempt(delayMs, signal)
        if (outcome === "shutdown" || this.closed) return

        try {
          await this.openAndAuth()
          return
        } catch (err) {
          if (err instanceof UnauthorizedError) {
            // Token may have expired between fetch and use, or been revoked.
            // Force-refresh and try again on the next loop iteration.
            this.config.tokenManager.invalidate()
          }
        }
      }
    } finally {
      this.reconnectAbort = null
      this.reconnectWakeUp = null
    }
  }

  /**
   * Race the backoff sleep against an external wake-up trigger
   * (`pingOrReconnect`) so consumers can short-circuit a stale delay when
   * the device's app-context changes (e.g. foreground after a long
   * background). Returns "shutdown" if the abort signal fired (close()),
   * "normal" if the delay elapsed naturally or the wake-up resolved.
   */
  private waitForReconnectAttempt(
    delayMs: number,
    signal: AbortSignal,
  ): Promise<"normal" | "shutdown"> {
    return new Promise((resolve) => {
      if (signal.aborted) {
        resolve("shutdown")
        return
      }
      let timer: ReturnType<typeof setTimeout> | null = null
      const cleanup = () => {
        if (timer) clearTimeout(timer)
        signal.removeEventListener("abort", onAbort)
        if (this.reconnectWakeUp === onWakeUp) {
          this.reconnectWakeUp = null
        }
      }
      const onAbort = () => {
        cleanup()
        resolve("shutdown")
      }
      const onWakeUp = () => {
        cleanup()
        resolve("normal")
      }
      timer = setTimeout(() => {
        cleanup()
        resolve("normal")
      }, delayMs)
      signal.addEventListener("abort", onAbort)
      this.reconnectWakeUp = onWakeUp
    })
  }

  private async resubscribeAll(): Promise<void> {
    const olds = Array.from(this.subscriptions.values())
    this.subscriptions.clear()
    for (const old of olds) {
      try {
        const result = (await this.send(old.method, old.params)) as {
          sub: string
          snapshot: unknown
        }
        old.subId = result.sub
        this.subscriptions.set(result.sub, old)
        old.onSnapshot(result.sub, result.snapshot)
      } catch (err) {
        old.onClosed({
          sub: old.subId,
          reason: "internal_error",
          message:
            err instanceof Error
              ? `Resubscribe failed: ${err.message}`
              : "Resubscribe failed",
        })
      }
    }
  }

  // -------------------------------------------------------------------------
  // Token refresh — proactive soft reconnect before JWT expires
  // -------------------------------------------------------------------------

  private scheduleTokenRefresh(): void {
    this.clearRefreshTimer()
    const ms = this.config.tokenManager.msUntilRefresh()
    if (ms <= 0) {
      // Already in leeway — schedule immediately on the next tick.
      this.refreshTimer = setTimeout(() => this.softReconnectForRefresh(), 0)
      return
    }
    this.refreshTimer = setTimeout(() => this.softReconnectForRefresh(), ms)
  }

  private clearRefreshTimer(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer)
      this.refreshTimer = null
    }
  }

  /**
   * Soft-reconnect: fetch a fresh token from the authEndpoint and re-establish
   * the WS connection with it. Subscriptions persist via the normal reconnect
   * machinery — they're re-issued with new server-side sub ids and the client
   * receives fresh snapshots.
   */
  private async softReconnectForRefresh(): Promise<void> {
    if (this.closed || !this.ws) return
    try {
      await this.config.tokenManager.refresh()
    } catch {
      // authEndpoint failed — let the next reconnect cycle (when WS naturally
      // closes due to expired token) retry. Don't kill the connection now.
      return
    }
    // Close the current socket; handleClose triggers reconnect via the existing
    // machinery, which will pick up the fresh token.
    try {
      this.ws.close(1000, "token_refresh")
    } catch {
      // ignore
    }
  }
}

export { PROTOCOL_VERSION }
