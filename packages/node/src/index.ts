/**
 * @mrdoge/node — official Node / TypeScript SDK for Mr. Doge realtime sports data.
 *
 * ```ts
 * import { MrDoge } from "@mrdoge/node"
 * const mrdoge = new MrDoge({ apiKey: process.env.MRDOGE_API_KEY! })
 * const matches = await mrdoge.matches.list({ date: "2026-05-12" })
 * ```
 */

export { MrDoge, type MrDogeOptions, DEFAULT_BASE_URL } from "./client"
export { Subscription } from "./subscription"
export type { CallOptions, ListAllOptions } from "./connection"
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
  AbortError,
} from "./errors"

// Re-export the most useful protocol types so consumers don't have to import
// from `@mrdoge/protocol` directly for typical usage.
export type {
  Region,
  Competition,
  Team,
  TeamDetail,
  TeamForm,
  TeamFormMatch,
  TeamFormResult,
  Sport,
  Match,
  MatchDetail,
  MatchStats,
  MatchStatus,
  MatchState,
  MatchSelect,
  MatchDetailSelect,
  Selector,
  Clock,
  Period,
  StatPlayer,
  Market,
  MarketSelect,
  BetItem,
  Pagination,
  PickConfidence,
  PickResult,
  Recommendation,
  WelcomeParams,
  SubscriptionClosedReason,
  ErrorCode,
} from "@mrdoge/protocol"
