/**
 * @mrdoge/sdk — official Node / TypeScript SDK for Mr. Doge realtime sports data.
 *
 * ```ts
 * import { MrDoge } from "@mrdoge/sdk"
 * const mrdoge = new MrDoge({ apiKey: process.env.MRDOGE_API_KEY! })
 * const matches = await mrdoge.matches.list({ date: "2026-05-12" })
 * ```
 */

export { MrDoge, type MrDogeOptions, DEFAULT_BASE_URL } from "./client"
export { Subscription } from "./subscription"
export {
  MrDogeError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  RateLimitError,
  SubscriptionLimitError,
  ConnectionLimitError,
  UnavailableError,
  InternalError,
  ProtocolError,
  ConnectionError,
  DisconnectedError,
  TimeoutError,
} from "./errors"

// Re-export the most useful protocol types so consumers don't have to import
// from `@mrdoge/protocol` directly for typical usage.
export type {
  Region,
  Competition,
  Team,
  Sport,
  Match,
  MatchDetail,
  MatchStats,
  MatchStatus,
  Market,
  BetItem,
  Pagination,
  AiPick,
  PickConfidence,
  PickResult,
  PickLeg,
  Recommendation,
  WelcomeParams,
  SubscriptionClosedReason,
  ErrorCode,
} from "@mrdoge/protocol"
