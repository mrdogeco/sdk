import type { ErrorCode, RpcError } from "@mrdoge/protocol"

/** Base class for every SDK-thrown error. Map by `instanceof` or by `code`. */
export class MrDogeError extends Error {
  readonly code:
    | ErrorCode
    | "connection_error"
    | "disconnected"
    | "timeout"
    | "auth_endpoint_failed"
    | "unknown"
  readonly data?: unknown

  constructor(
    code: MrDogeError["code"],
    message: string,
    data?: unknown,
  ) {
    super(message)
    this.name = this.constructor.name
    this.code = code
    this.data = data
  }
}

export class UnauthorizedError extends MrDogeError {
  constructor(message: string, data?: unknown) {
    super("unauthorized", message, data)
  }
}

export class ForbiddenError extends MrDogeError {
  constructor(message: string, data?: unknown) {
    super("forbidden", message, data)
  }
}

export class NotFoundError extends MrDogeError {
  constructor(message: string, data?: unknown) {
    super("not_found", message, data)
  }
}

export class ValidationError extends MrDogeError {
  constructor(message: string, data?: unknown) {
    super("invalid_params", message, data)
  }
}

export class RateLimitError extends MrDogeError {
  readonly retryAfterMs: number
  readonly limit?: number
  readonly remaining?: number
  readonly resetAt?: Date

  constructor(message: string, data?: unknown) {
    super("rate_limited", message, data)
    const d = (data ?? {}) as {
      retryAfterMs?: number
      limit?: number
      remaining?: number
      resetAt?: string
    }
    this.retryAfterMs = d.retryAfterMs ?? 0
    this.limit = d.limit
    this.remaining = d.remaining
    this.resetAt = d.resetAt ? new Date(d.resetAt) : undefined
  }
}

export class SubscriptionLimitError extends MrDogeError {
  constructor(message: string, data?: unknown) {
    super("subscription_limit_exceeded", message, data)
  }
}

export class ConnectionLimitError extends MrDogeError {
  readonly current?: number
  readonly max?: number

  constructor(message: string, data?: unknown) {
    super("connection_limit_exceeded", message, data)
    const d = (data ?? {}) as { current?: number; max?: number }
    this.current = d.current
    this.max = d.max
  }
}

export class UnavailableError extends MrDogeError {
  constructor(message: string, data?: unknown) {
    super("unavailable", message, data)
  }
}

export class InternalError extends MrDogeError {
  constructor(message: string, data?: unknown) {
    super("internal_error", message, data)
  }
}

export class ProtocolError extends MrDogeError {
  constructor(message: string, data?: unknown) {
    super("protocol_error", message, data)
  }
}

export class ConnectionError extends MrDogeError {
  constructor(message: string, data?: unknown) {
    super("connection_error", message, data)
  }
}

export class DisconnectedError extends MrDogeError {
  constructor(message = "Connection dropped before response", data?: unknown) {
    super("disconnected", message, data)
  }
}

export class TimeoutError extends MrDogeError {
  constructor(message: string, data?: unknown) {
    super("timeout", message, data)
  }
}

/**
 * Raised when the customer's `authEndpoint` failed to return a valid token —
 * unreachable, bad status code, malformed JSON, missing required fields.
 *
 * Customer's authEndpoint is the source of truth; this surfaces when their
 * backend is broken or down.
 */
export class AuthEndpointError extends MrDogeError {
  constructor(message: string, data?: unknown) {
    super("auth_endpoint_failed", message, data)
  }
}

const CODE_MAP: Record<ErrorCode, new (message: string, data?: unknown) => MrDogeError> = {
  invalid_request: ProtocolError,
  invalid_params: ValidationError,
  method_not_found: ProtocolError,
  unauthorized: UnauthorizedError,
  forbidden: ForbiddenError,
  not_found: NotFoundError,
  rate_limited: RateLimitError,
  subscription_limit_exceeded: SubscriptionLimitError,
  connection_limit_exceeded: ConnectionLimitError,
  unavailable: UnavailableError,
  internal_error: InternalError,
  protocol_error: ProtocolError,
}

export function rpcErrorToTyped(err: RpcError): MrDogeError {
  const Ctor = CODE_MAP[err.code]
  if (!Ctor) return new MrDogeError("unknown", err.message, err.data)
  return new Ctor(err.message, err.data)
}
