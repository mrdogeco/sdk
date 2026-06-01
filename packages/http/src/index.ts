/**
 * @mrdoge/http — HTTP-only SDK for the Mr. Doge API.
 *
 * Zero runtime deps beyond `@mrdoge/protocol`. Works anywhere `fetch` exists:
 * Node, browsers, React Native, Cloudflare Workers, Vercel Edge, Lambda.
 *
 * Server-side:
 * ```ts
 * import { createHttpClient } from "@mrdoge/http"
 * const http = createHttpClient({ apiKey: process.env.MRDOGE_API_KEY! })
 * const matches = await http.call("matches.getLive", { sports: ["soccer"] })
 * ```
 *
 * Browser / React Native:
 * ```ts
 * const http = createHttpClient({
 *   fetchToken: async () => (await fetch("/api/mrdoge-token")).text(),
 * })
 * ```
 */

export {
  createHttpClient,
  DEFAULT_BASE_URL,
  type MrDogeHttpClient,
  type MrDogeHttpOptions,
  type HttpMethodName,
  type CallOptions,
} from "./client"

export {
  MrDogeError,
  InvalidRequestError,
  ValidationError,
  MethodNotFoundError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  RateLimitError,
  SubscriptionLimitError,
  ConnectionLimitError,
  UnavailableError,
  InternalError,
  ProtocolError,
  NetworkError,
  TimeoutError,
  AbortError,
} from "./errors"

// Re-export the protocol types most commonly used by HTTP consumers, so
// they don't have to import from `@mrdoge/protocol` directly. Matches the
// re-export pattern used by `@mrdoge/node` and `@mrdoge/client`.
export type {
  Region,
  Competition,
  Team,
  TeamDetail,
  TeamForm,
  Sport,
  SportName,
  Match,
  MatchDetail,
  MatchStats,
  SoccerStats,
  TennisStats,
  BasketballStats,
  AmericanFootballStats,
  BaseballStats,
  IceHockeyStats,
  VolleyballStats,
  HandballStats,
  MatchStatus,
  MatchSelect,
  MatchDetailSelect,
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
  BetItem,
  Pagination,
  PickConfidence,
  PickResult,
  Recommendation,
  ErrorCode,
} from "@mrdoge/protocol"
