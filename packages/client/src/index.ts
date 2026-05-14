/**
 * @mrdoge/client — Mr. Doge SDK for browsers, React Native, and edge runtimes.
 *
 * Authenticates via short-lived JWTs minted by your own backend; the API key
 * never leaves your server. Same method surface as @mrdoge/sdk (Node) — the
 * only difference is the constructor.
 *
 * ```ts
 * import { MrDoge } from "@mrdoge/client"
 *
 * const mrdoge = new MrDoge({ authEndpoint: "/api/mrdoge/token" })
 * const matches = await mrdoge.matches.list({ date: "2026-05-13" })
 * ```
 */

export { MrDoge, type MrDogeOptions, DEFAULT_BASE_URL } from "./client"
export { Subscription } from "./subscription"
export type { AuthEndpointResponse, AuthEndpointFetcher } from "./token-manager"
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
  AuthEndpointError,
} from "./errors"

// Re-export protocol types so consumers don't dig into @mrdoge/protocol directly.
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
