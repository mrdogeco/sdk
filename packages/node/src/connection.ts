import WebSocket, { type RawData } from "ws"
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
import {
  ConnectionError,
  DisconnectedError,
  ProtocolError,
  TimeoutError,
  UnauthorizedError,
  rpcErrorToTyped,
  MrDogeError,
} from "./errors"
import { Emitter } from "./internal/emitter"
import { DEFAULT_BACKOFF, type BackoffConfig, nextDelay, sleep } from "./internal/backoff"

// Terminal close codes — see PROTOCOL.md §10.
const TERMINAL_CLOSE_CODES = new Set([4001, 4002, 4003, 4029])

export interface ConnectionConfig {
  baseUrl: string
  apiKey: string
  /** Default locale applied to method params. Per-call overrides win. */
  locale?: string
  /** Default timezone applied to method params. Per-call overrides win. */
  timezone?: string
  requestTimeoutMs: number
  maxReconnectAttempts: number
  reconnectBackoff: BackoffConfig
  compression: boolean
  /** Auth must complete (auth ack + welcome) within this many ms. */
  authTimeoutMs: number
}

export const DEFAULT_CONFIG: Omit<ConnectionConfig, "apiKey" | "baseUrl"> = {
  requestTimeoutMs: 10_000,
  maxReconnectAttempts: Infinity,
  reconnectBackoff: DEFAULT_BACKOFF,
  compression: true,
  authTimeoutMs: 10_000,
}

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

/**
 * Active subscriptions tracked by the connection. The handle's `subId` is
 * mutable — it changes on reconnect when the server issues a fresh id.
 */
export interface SubscriptionRegistration {
  /** Current server-issued sub id. Changes on reconnect. */
  subId: string
  method: MethodName
  params: unknown
  onEvent: (event: SubscriptionEventParams) => void
  onClosed: (params: SubscriptionClosedParams) => void
  /** Called by the connection when a reconnect resubscribe produced a fresh snapshot. */
  onSnapshot: (newSubId: string, snapshot: unknown) => void
}

/**
 * Long-lived WebSocket connection with JSON-RPC dispatch and automatic
 * reconnection. Subscriptions are resubscribed transparently on reconnect.
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

  constructor(config: ConnectionConfig) {
    this.config = config
  }

  on = this.emitter.on.bind(this.emitter)
  off = this.emitter.off.bind(this.emitter)

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN && this.welcome !== null
  }

  /**
   * Idempotent. Returns the welcome payload once connected + authed.
   */
  async connect(): Promise<WelcomeParams> {
    if (this.closed) throw new ConnectionError("Connection is closed")
    if (this.welcome && this.ws?.readyState === WebSocket.OPEN) return this.welcome
    if (this.connectingPromise) return this.connectingPromise

    this.connectingPromise = this.openAndAuth().finally(() => {
      this.connectingPromise = null
    })
    return this.connectingPromise
  }

  async call<M extends MethodName>(
    method: M,
    params: MethodParams<M>,
  ): Promise<MethodResult<M>> {
    await this.connect()
    return this.send(method, params) as Promise<MethodResult<M>>
  }

  /**
   * Registers a subscription with the connection. The connection sends the
   * subscribe call, stores the registration for reconnect, and routes incoming
   * push events to the handler.
   */
  async registerSubscription<M extends MethodName>(
    method: M,
    params: MethodParams<M>,
    handlers: {
      onEvent: SubscriptionRegistration["onEvent"]
      onClosed: SubscriptionRegistration["onClosed"]
      onSnapshot: SubscriptionRegistration["onSnapshot"]
    },
  ): Promise<{ subId: string; snapshot: unknown }> {
    await this.connect()
    const result = (await this.send(method, params)) as { sub: string; snapshot: unknown }
    const registration: SubscriptionRegistration = {
      subId: result.sub,
      method,
      params,
      onEvent: handlers.onEvent,
      onClosed: handlers.onClosed,
      onSnapshot: handlers.onSnapshot,
    }
    this.subscriptions.set(result.sub, registration)
    return { subId: result.sub, snapshot: result.snapshot }
  }

  /**
   * Cancels a subscription server-side and removes the registration locally.
   */
  async cancelSubscription(subId: string): Promise<void> {
    const reg = this.subscriptions.get(subId)
    if (!reg) return
    this.subscriptions.delete(subId)
    if (this.ws?.readyState === WebSocket.OPEN) {
      try {
        await this.send("subscription.cancel" as MethodName, { sub: subId } as never)
      } catch {
        // Best-effort: even if server rejects, local cleanup is done.
      }
    }
  }

  async close(): Promise<void> {
    this.closed = true
    this.reconnectAbort?.abort()
    this.reconnectAbort = null
    for (const [, p] of this.pending) {
      clearTimeout(p.timer)
      p.reject(new DisconnectedError("Connection closed by client"))
    }
    this.pending.clear()
    this.subscriptions.clear()
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) {
      this.ws.close(1000, "client_close")
    }
    this.ws = null
    this.welcome = null
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private async openAndAuth(): Promise<WelcomeParams> {
    const ws = new WebSocket(this.config.baseUrl, [SUBPROTOCOL], {
      perMessageDeflate: this.config.compression
        ? { threshold: 1024 }
        : false,
      handshakeTimeout: 15_000,
    })
    this.ws = ws
    this.welcome = null

    await new Promise<void>((resolve, reject) => {
      const onOpen = () => {
        cleanup()
        resolve()
      }
      const onError = (err: Error) => {
        cleanup()
        reject(new ConnectionError(`Failed to open WebSocket: ${err.message}`))
      }
      const onClose = (code: number, reason: Buffer) => {
        cleanup()
        reject(new ConnectionError(`WebSocket closed before open (${code}): ${reason.toString()}`))
      }
      const cleanup = () => {
        ws.off("open", onOpen)
        ws.off("error", onError)
        ws.off("close", onClose)
      }
      ws.once("open", onOpen)
      ws.once("error", onError)
      ws.once("close", onClose)
    })

    // Attach long-lived listeners now that we're open.
    ws.on("message", (data) => this.handleMessage(data))
    ws.on("close", (code, reason) => this.handleClose(code, reason.toString()))
    ws.on("error", (err) => this.handleSocketError(err))

    // Send auth as the first frame and await both the ack and the welcome.
    const welcome = await this.performAuth()
    this.welcome = welcome
    this.reconnectAttempt = 0
    this.emitter.emit("connected", { welcome })

    // If this was a reconnect, resubscribe everything.
    if (this.subscriptions.size > 0) {
      await this.resubscribeAll()
    }
    return welcome
  }

  private async performAuth(): Promise<WelcomeParams> {
    const welcomePromise = new Promise<WelcomeParams>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new TimeoutError("Auth timed out waiting for welcome"))
      }, this.config.authTimeoutMs)
      this.pendingWelcome = {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
      }
    })

    const authAck = this.send("auth" as MethodName, { apiKey: this.config.apiKey } as never).catch(
      (err: Error) => {
        // Surface auth-level error explicitly (server may close immediately).
        if (err instanceof MrDogeError) throw err
        throw new UnauthorizedError(`Authentication failed: ${err.message}`)
      },
    )

    await authAck
    return welcomePromise
  }

  /**
   * Set during `performAuth` so we can resolve when the `welcome` notification arrives.
   */
  private pendingWelcome: PendingRequest | null = null

  private send(method: string, params: unknown): Promise<unknown> {
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
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new TimeoutError(`Request "${method}" timed out after ${this.config.requestTimeoutMs}ms`))
      }, this.config.requestTimeoutMs)
      this.pending.set(id, { resolve, reject, timer })
      try {
        ws.send(JSON.stringify(frame))
      } catch (err) {
        this.pending.delete(id)
        clearTimeout(timer)
        reject(new ConnectionError(`Failed to send frame: ${(err as Error).message}`))
      }
    })
  }

  private handleMessage(raw: RawData): void {
    let text: string
    if (typeof raw === "string") text = raw
    else if (Buffer.isBuffer(raw)) text = raw.toString("utf8")
    else if (raw instanceof ArrayBuffer) text = Buffer.from(raw).toString("utf8")
    else text = Buffer.concat(raw as Buffer[]).toString("utf8")

    let frame: any
    try {
      frame = JSON.parse(text)
    } catch {
      // Drop unparseable frames — the protocol guarantees JSON.
      return
    }
    if (frame.jsonrpc !== "2.0") return

    // Response to a pending request?
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

    // Notification — `method` carries the event name.
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

    // Unknown notifications: ignore per the additive-future-changes rule.
  }

  private handleClose(code: number, reason: string): void {
    const wasConnected = this.welcome !== null
    this.welcome = null
    this.ws = null

    // Reject every in-flight request — they didn't complete.
    for (const [, p] of this.pending) {
      clearTimeout(p.timer)
      p.reject(new DisconnectedError(`Connection closed (${code}): ${reason}`))
    }
    this.pending.clear()
    if (this.pendingWelcome) {
      clearTimeout(this.pendingWelcome.timer)
      this.pendingWelcome.reject(new DisconnectedError(`Connection closed during auth (${code})`))
      this.pendingWelcome = null
    }

    if (this.closed) return

    this.emitter.emit("disconnected", { code, reason })

    if (TERMINAL_CLOSE_CODES.has(code)) {
      // Don't reconnect on terminal codes — let the caller surface it.
      this.closed = true
      return
    }

    if (wasConnected || this.subscriptions.size > 0) {
      // Try to reconnect.
      this.scheduleReconnect()
    }
  }

  private handleSocketError(_err: Error): void {
    // The "close" event always follows; let handleClose drive reconnection.
  }

  private async scheduleReconnect(): Promise<void> {
    if (this.closed) return
    if (this.reconnectAbort) return // already scheduled
    this.reconnectAbort = new AbortController()
    const signal = this.reconnectAbort.signal

    while (!this.closed && this.reconnectAttempt < this.config.maxReconnectAttempts) {
      this.reconnectAttempt += 1
      const delayMs = nextDelay(this.reconnectAttempt, this.config.reconnectBackoff)
      this.emitter.emit("reconnecting", { attempt: this.reconnectAttempt, delayMs })
      try {
        await sleep(delayMs, signal)
      } catch {
        return // aborted
      }
      if (this.closed) return
      try {
        await this.openAndAuth()
        this.reconnectAbort = null
        return
      } catch (err) {
        if (err instanceof UnauthorizedError) {
          this.closed = true
          this.reconnectAbort = null
          return
        }
        // Otherwise loop and try again with bigger backoff.
      }
    }
    this.reconnectAbort = null
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
}

export { PROTOCOL_VERSION }
