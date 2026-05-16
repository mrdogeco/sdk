import type {
  MethodName,
  MethodParams,
  MethodResult,
  SubscriptionMethodName,
  RpcRequest,
  RpcSuccess,
  RpcErrorResponse,
} from "@mrdoge/protocol"
import {
  AbortError,
  MrDogeError,
  NetworkError,
  ProtocolError,
  TimeoutError,
  fromJsonRpcError,
} from "./errors"

/**
 * Per-call options accepted by every method that makes an HTTP request.
 * Mirrors the `fetch` convention so customers can plug in a standard
 * `AbortController`.
 */
export interface CallOptions {
  /**
   * Customer-supplied abort signal. When fired, the in-flight request is
   * aborted and the promise rejects with `AbortError` (`err.name === "AbortError"`).
   * Composes with the configured `requestTimeoutMs` — whichever fires first wins.
   */
  signal?: AbortSignal
}

/**
 * Methods callable over HTTP. Excludes WS-only methods:
 *   - `auth` and `subscription.cancel` (wire-level, not meaningful over HTTP)
 *   - any method with `pushEvents` (subscriptions need a socket)
 */
export type HttpMethodName = Exclude<
  MethodName,
  SubscriptionMethodName | "auth" | "subscription.cancel"
>

export interface MrDogeHttpOptions {
  /**
   * Server-side use. Long-lived `sk_live_...` / `sk_test_...` API key. Never
   * embed this in a browser bundle — anyone who opens DevTools steals it.
   */
  apiKey?: string

  /**
   * Browser / React Native use. Async callback returning a short-lived JWT
   * (minted by your backend via `tokens.create`). Called once per request —
   * cache the token in the callback yourself if you want to avoid the
   * round-trip to your backend.
   */
  fetchToken?: () => Promise<string>

  /** Override the API base URL. Defaults to the production endpoint. */
  baseUrl?: string

  /** Default `locale` applied via `X-Locale` header. Per-call params take precedence. */
  locale?: string

  /** Default `timezone` applied via `X-Timezone` header. */
  timezone?: string

  /** Custom fetch implementation. Defaults to `globalThis.fetch`. */
  fetch?: typeof globalThis.fetch

  /** Per-request timeout in ms. Default 10s. */
  requestTimeoutMs?: number
}

export const DEFAULT_BASE_URL = "https://api.mrdoge.co/sdk/v1"

export interface MrDogeHttpClient {
  /**
   * Call a single method. Throws a typed `MrDogeError` subclass on protocol
   * errors, `NetworkError` on transport failures, `TimeoutError` on timeout,
   * `AbortError` when `options.signal` fires.
   */
  call<M extends HttpMethodName>(
    method: M,
    params: MethodParams<M>,
    options?: CallOptions,
  ): Promise<MethodResult<M>>
}

let idCounter = 1
function generateId(): string {
  return `${idCounter++}-${Math.random().toString(36).slice(2, 8)}`
}

export function createHttpClient(opts: MrDogeHttpOptions): MrDogeHttpClient {
  if (!opts.apiKey && !opts.fetchToken) {
    throw new Error(
      "createHttpClient requires either `apiKey` (server-side) or `fetchToken` (browser/RN)",
    )
  }
  if (opts.apiKey && opts.fetchToken) {
    throw new Error(
      "createHttpClient accepts either `apiKey` or `fetchToken`, not both",
    )
  }
  const baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "")
  const fetchFn = opts.fetch ?? globalThis.fetch
  if (!fetchFn) {
    throw new Error(
      "No `fetch` implementation found on globalThis. Pass `fetch` in options (Node <18 or environments without a global fetch).",
    )
  }
  const timeoutMs = opts.requestTimeoutMs ?? 10_000

  async function authHeader(): Promise<string> {
    if (opts.apiKey) return `Bearer ${opts.apiKey}`
    const token = await opts.fetchToken!()
    if (!token) {
      throw new MrDogeError("unauthorized", "`fetchToken` returned an empty token")
    }
    return `Bearer ${token}`
  }

  async function call<M extends HttpMethodName>(
    method: M,
    params: MethodParams<M>,
    options?: CallOptions,
  ): Promise<MethodResult<M>> {
    // Fast-path: signal already aborted before we even start the fetch.
    if (options?.signal?.aborted) {
      throw new AbortError()
    }

    const request: RpcRequest = {
      jsonrpc: "2.0",
      id: generateId(),
      method,
      params,
    }

    const headers: Record<string, string> = {
      "content-type": "application/json",
      authorization: await authHeader(),
    }
    if (opts.locale) headers["x-locale"] = opts.locale
    if (opts.timezone) headers["x-timezone"] = opts.timezone

    // Internal controller drives timeout + relays the customer signal. We
    // distinguish the two reasons in the catch block via `customerAborted`,
    // so the same `AbortError` surface from `fetch` can map to either
    // `TimeoutError` or `AbortError` for the caller.
    const controller = new AbortController()
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs)

    let customerAborted = false
    const onCustomerAbort = () => {
      customerAborted = true
      controller.abort()
    }
    options?.signal?.addEventListener("abort", onCustomerAbort)

    const cleanup = () => {
      clearTimeout(timeoutHandle)
      options?.signal?.removeEventListener("abort", onCustomerAbort)
    }

    let res: Response
    try {
      res = await fetchFn(`${baseUrl}/rpc`, {
        method: "POST",
        headers,
        body: JSON.stringify(request),
        signal: controller.signal,
      })
    } catch (err) {
      cleanup()
      const e = err as { name?: string; message?: string }
      if (e?.name === "AbortError") {
        if (customerAborted) throw new AbortError()
        throw new TimeoutError(`Request timed out after ${timeoutMs}ms`)
      }
      throw new NetworkError(e?.message ?? "Network request failed")
    }
    cleanup()

    // 5xx without a JSON body is a transport-level failure; surface as
    // NetworkError so retry logic can distinguish it from protocol errors.
    if (res.status >= 500) {
      const text = await safeReadText(res)
      if (!isJsonResponse(res) || !text) {
        throw new NetworkError(`HTTP ${res.status} ${res.statusText}${text ? `: ${text.slice(0, 200)}` : ""}`)
      }
    }

    let parsed: unknown
    try {
      parsed = await res.json()
    } catch {
      throw new NetworkError(`Invalid JSON response (HTTP ${res.status})`)
    }
    if (Array.isArray(parsed)) {
      throw new ProtocolError(
        "Server returned a batch response to a single request",
      )
    }
    const frame = parsed as RpcSuccess | RpcErrorResponse
    if (!frame || typeof frame !== "object" || (frame as { jsonrpc?: string }).jsonrpc !== "2.0") {
      throw new ProtocolError("Response is not a JSON-RPC 2.0 frame")
    }
    if ("error" in frame) {
      throw fromJsonRpcError(frame.error.code, frame.error.message, frame.error.data)
    }
    return frame.result as MethodResult<M>
  }

  return { call }
}

function isJsonResponse(res: Response): boolean {
  const ct = res.headers.get("content-type") ?? ""
  return ct.toLowerCase().includes("application/json")
}

async function safeReadText(res: Response): Promise<string | null> {
  try {
    return await res.text()
  } catch {
    return null
  }
}
