/**
 * @mrdoge/client — Mr. Doge SDK for browsers, React Native, and edge runtimes.
 *
 * Authenticates via short-lived JWTs minted by your own backend; the API key
 * never leaves your server. Same method surface as @mrdoge/node (Node) — the
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
export type { CallOptions, ListAllOptions } from "./connection"
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
  AbortError,
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
  SportName,
  Match,
  MatchDetail,
  MatchStats,
  // Per-sport stats variants (for narrowing)
  SoccerStats,
  TennisStats,
  BasketballStats,
  AmericanFootballStats,
  BaseballStats,
  IceHockeyStats,
  VolleyballStats,
  HandballStats,
  MatchStatus,
  MatchState,
  MatchSelect,
  MatchDetailSelect,
  Selector,
  Clock,
  Period,
  StatPlayer,
  // Timeline shape + per-sport event-type unions
  TimelineEvent,
  SoccerTimelineEventType,
  TennisTimelineEventType,
  BasketballTimelineEventType,
  AmericanFootballTimelineEventType,
  BaseballTimelineEventType,
  IceHockeyTimelineEventType,
  VolleyballTimelineEventType,
  HandballTimelineEventType,
  Market,
  MarketSelect,
  Line,
  BetItem,
  Pagination,
  PickConfidence,
  PickResult,
  Recommendation,
  WelcomeParams,
  SubscriptionClosedReason,
  ErrorCode,
} from "@mrdoge/protocol"
