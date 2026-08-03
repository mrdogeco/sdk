/**
 * @mrdoge/protocol — wire-format spec + shared Zod schemas.
 *
 * - `envelope` — JSON-RPC 2.0 frames + error codes
 * - `resources` — Region, Competition, Team, Match, MatchDetail, MatchStats,
 *   Market, Line, BetItem (deprecated), Recommendation, Pagination
 * - `events` — push event payloads (`subscription.event`, `subscription.closed`, `welcome`)
 * - `methods` — the v1 method registry
 *
 * See ../PROTOCOL.md for the human-readable contract.
 */

export * from "./envelope"
export * from "./resources"
export * from "./events"
export * from "./methods"
