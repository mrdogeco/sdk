import { z } from "zod"

/**
 * Protocol version. Bumped only on breaking changes; ships in `/sdk/v{N}` URL path.
 */
export const PROTOCOL_VERSION = 1

/**
 * WebSocket subprotocol identifier, validated at handshake (§2 of PROTOCOL.md).
 */
export const SUBPROTOCOL = `mrdoge.v${PROTOCOL_VERSION}` as const

// ---------------------------------------------------------------------------
// Error codes
// ---------------------------------------------------------------------------

/**
 * Stable string error codes. See PROTOCOL.md §8 for the full taxonomy.
 * SDKs map these to typed error classes.
 */
export const ErrorCode = z.enum([
  "invalid_request",
  "invalid_params",
  "method_not_found",
  "unauthorized",
  "forbidden",
  "not_found",
  "rate_limited",
  "subscription_limit_exceeded",
  "unavailable",
  "internal_error",
  "protocol_error",
])
export type ErrorCode = z.infer<typeof ErrorCode>

export const RpcError = z.object({
  code: ErrorCode,
  message: z.string(),
  data: z.unknown().optional(),
})
export type RpcError = z.infer<typeof RpcError>

// ---------------------------------------------------------------------------
// JSON-RPC 2.0 envelope (with our string-code extension)
// ---------------------------------------------------------------------------

/**
 * Request frame: client → server. Always has an `id` for correlation.
 */
export const RpcRequest = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.string(),
  method: z.string(),
  params: z.unknown().optional(),
})
export type RpcRequest = z.infer<typeof RpcRequest>

/**
 * Success response: server → client, matched to a request by `id`.
 */
export const RpcSuccess = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.string(),
  result: z.unknown(),
})
export type RpcSuccess = z.infer<typeof RpcSuccess>

/**
 * Error response: server → client, matched to a request by `id`.
 */
export const RpcErrorResponse = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.string(),
  error: RpcError,
})
export type RpcErrorResponse = z.infer<typeof RpcErrorResponse>

/**
 * Notification: server → client, no `id`. Used for `welcome`,
 * `subscription.event`, `subscription.closed`.
 */
export const RpcNotification = z.object({
  jsonrpc: z.literal("2.0"),
  method: z.string(),
  params: z.unknown().optional(),
})
export type RpcNotification = z.infer<typeof RpcNotification>

/**
 * Any frame the server may send.
 */
export const ServerFrame = z.union([RpcSuccess, RpcErrorResponse, RpcNotification])
export type ServerFrame = z.infer<typeof ServerFrame>
