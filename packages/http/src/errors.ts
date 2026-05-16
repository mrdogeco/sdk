import type { ErrorCode } from "@mrdoge/protocol"

/**
 * Base error for all HTTP SDK errors. The `code` is either a protocol-level
 * `ErrorCode` (mapped from the server's JSON-RPC error frame) or one of the
 * client-only codes for transport failures.
 */
export class MrDogeError extends Error {
  constructor(
    public readonly code: ErrorCode | "network_error" | "timeout" | "aborted",
    message: string,
    public readonly data?: unknown,
  ) {
    super(message)
    this.name = new.target.name
  }
}

export class InvalidRequestError extends MrDogeError {
  constructor(message: string, data?: unknown) {
    super("invalid_request", message, data)
  }
}

export class ValidationError extends MrDogeError {
  constructor(message: string, data?: unknown) {
    super("invalid_params", message, data)
  }
}

export class MethodNotFoundError extends MrDogeError {
  constructor(message: string, data?: unknown) {
    super("method_not_found", message, data)
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

export class RateLimitError extends MrDogeError {
  constructor(message: string, data?: unknown) {
    super("rate_limited", message, data)
  }
}

export class SubscriptionLimitError extends MrDogeError {
  constructor(message: string, data?: unknown) {
    super("subscription_limit_exceeded", message, data)
  }
}

export class ConnectionLimitError extends MrDogeError {
  constructor(message: string, data?: unknown) {
    super("connection_limit_exceeded", message, data)
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

export class NetworkError extends MrDogeError {
  constructor(message: string) {
    super("network_error", message)
  }
}

export class TimeoutError extends MrDogeError {
  constructor(message: string) {
    super("timeout", message)
  }
}

/**
 * Thrown when a request is aborted via the customer-supplied `options.signal`.
 * Matches the `fetch` convention: `err.name === "AbortError"` (the parent
 * constructor sets `name` from `new.target.name`, which is `"AbortError"`).
 */
export class AbortError extends MrDogeError {
  constructor(message = "Request aborted") {
    super("aborted", message)
  }
}

const BY_CODE: Record<ErrorCode, new (message: string, data?: unknown) => MrDogeError> = {
  invalid_request: InvalidRequestError,
  invalid_params: ValidationError,
  method_not_found: MethodNotFoundError,
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

export function fromJsonRpcError(
  code: ErrorCode,
  message: string,
  data?: unknown,
): MrDogeError {
  const Cls = BY_CODE[code] ?? InternalError
  return new Cls(message, data)
}
