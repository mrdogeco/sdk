import { z } from "zod"
import * as R from "./resources"

// ---------------------------------------------------------------------------
// Shared param fragments
// ---------------------------------------------------------------------------

const LocaleOnly = {
  locale: z.string().optional(),
}

const LocaleAndTimezone = {
  ...LocaleOnly,
  timezone: z.string().optional(),
}

const Cursor = {
  cursor: z.string().optional(),
  limit: z.number().int().positive().max(100).optional(),
}

const DateRange = {
  /** YYYY-MM-DD. Mutually exclusive with `startDate`/`endDate`. */
  date: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
}

// ---------------------------------------------------------------------------
// Method registry
// ---------------------------------------------------------------------------

/**
 * Every v1 method, keyed by its wire name. `params` and `result` are Zod
 * schemas; the server validates both directions, the SDK derives typed methods.
 *
 * Subscription methods additionally declare `pushEvents` — the set of
 * `subscription.event.event` values they may emit. Used by SDK codegen to
 * type the per-subscription callback table.
 */
export const methods = {
  // -------------------------------------------------------------------------
  // Protocol-level methods
  // -------------------------------------------------------------------------

  auth: {
    /**
     * Exactly one of `apiKey` (server-side use with `sk_live_...`) or
     * `token` (client-side use with a JWT minted via `tokens.create`).
     */
    params: z.union([
      z.object({ apiKey: z.string() }),
      z.object({ token: z.string() }),
    ]),
    result: z.object({
      ok: z.literal(true),
    }),
  },

  "subscription.cancel": {
    params: z.object({
      sub: z.string(),
    }),
    result: z.object({
      ok: z.literal(true),
    }),
  },

  /**
   * Mint a short-lived auth token for client-side use. The customer's backend
   * calls this with its `sk_live_...` key, then hands the token to the customer's
   * frontend (browser/React Native) via @mrdoge/client. Frontends never see the
   * sk_live_... key.
   *
   * TTL is customer-configurable: default 600s (10 min), server enforces bounds
   * (min 60s, max 86400s = 24h).
   */
  "tokens.create": {
    params: z.object({
      ttl: z.number().int().min(60).max(86400).optional(),
    }),
    result: z.object({
      token: z.string(),
      expiresAt: z.string().datetime({ offset: true }),
    }),
  },

  // -------------------------------------------------------------------------
  // Discovery
  // -------------------------------------------------------------------------

  "regions.list": {
    params: z.object({
      /** Filter to regions that have matches in the listed sports. */
      sports: z.array(z.string()).optional(),
      status: z.array(R.MatchStatus).optional(),
      ...DateRange,
      ...LocaleAndTimezone,
    }),
    /**
     * When at least one filter is provided (date, sports, status), each
     * returned region carries `eventCount` and `competitionCount` reflecting
     * the filter set. With no filters, returns all regions sans counts.
     */
    result: z.array(R.Region),
  },

  "competitions.list": {
    params: z.object({
      regionIds: z.array(R.RegionId).optional(),
      sports: z.array(z.string()).optional(),
      status: z.array(R.MatchStatus).optional(),
      /** Max number of competitions to return. Server caps at 200. */
      limit: z.number().int().positive().max(200).optional(),
      ...DateRange,
      ...LocaleAndTimezone,
    }),
    /**
     * When filters are provided, each competition carries `eventCount`
     * reflecting the filter set.
     */
    result: z.array(R.Competition),
  },

  "teams.list": {
    params: z.object({
      sports: z.array(z.string()).optional(),
      regionIds: z.array(R.RegionId).optional(),
      competitionIds: z.array(R.CompetitionId).optional(),
      /** Case-insensitive substring match against team name. */
      search: z.string().min(1).optional(),
      /** Max number of teams. Server caps at 500. */
      limit: z.number().int().positive().max(500).optional(),
      ...LocaleOnly,
    }),
    result: z.array(R.Team),
  },

  "teams.get": {
    params: z.object({
      id: R.TeamId,
      ...LocaleOnly,
    }),
    result: R.TeamDetail,
  },

  /**
   * Aggregate W/D/L summary over a team's most recent completed matches.
   * `sampleSize` defaults to 10 server-side; bounded 1–50.
   */
  "teams.form": {
    params: z.object({
      teamId: R.TeamId,
      sampleSize: z.number().int().min(1).max(50).optional(),
      ...LocaleOnly,
    }),
    result: R.TeamForm,
  },

  // -------------------------------------------------------------------------
  // Matches
  // -------------------------------------------------------------------------

  "matches.list": {
    params: z.object({
      competitionIds: z.array(R.CompetitionId).optional(),
      regionIds: z.array(R.RegionId).optional(),
      /** Filter by teams — returns matches where any listed team is home or away. */
      teamIds: z.array(R.TeamId).optional(),
      sports: z.array(z.string()).optional(),
      status: z.array(R.MatchStatus).optional(),
      /**
       * Optional field selector. When omitted, the full `Match` shape is
       * returned. When provided, only the listed fields appear in each
       * `data[]` entry. See `Selector<Match>` / `MatchSelect` for the typed
       * shape. Saves bandwidth and serialization time.
       */
      select: R.SelectorTree.optional(),
      ...DateRange,
      ...Cursor,
      ...LocaleAndTimezone,
    }),
    result: z.object({
      data: z.array(R.Match),
      pagination: R.Pagination,
    }),
  },

  "matches.get": {
    params: z.object({
      id: R.MatchId,
      /** Optional field selector. See `Selector<MatchDetail>` / `MatchDetailSelect`. */
      select: R.SelectorTree.optional(),
      ...LocaleOnly,
    }),
    result: R.MatchDetail,
  },

  "matches.trending": {
    params: z.object({
      sports: z.array(z.string()).optional(),
      status: z.array(R.MatchStatus).optional(),
      /** Result count. Server default 5, capped at 50. */
      limit: z.number().int().positive().max(50).optional(),
      /** Optional field selector. See `Selector<Match>` / `MatchSelect`. */
      select: R.SelectorTree.optional(),
      ...LocaleAndTimezone,
    }),
    result: z.array(R.Match),
  },

  "matches.search": {
    params: z.object({
      query: z.string().min(2),
      /** Restrict the search to one or more sports. */
      sports: z.array(z.string()).optional(),
      /** Filter by match status (upcoming/live/completed). */
      status: z.array(R.MatchStatus).optional(),
      limit: z.number().int().positive().max(20).optional(),
      /** Optional field selector. See `Selector<Match>` / `MatchSelect`. */
      select: R.SelectorTree.optional(),
      ...LocaleOnly,
    }),
    result: z.array(R.Match),
  },

  /**
   * One-shot snapshot of live matches. Same data as the initial `snapshot`
   * field of `matches.subscribeLive`, without registering a subscription —
   * for HTTP/polling customers and for cold-start paths that want to render
   * the initial state before opening a WebSocket for deltas.
   */
  "matches.getLive": {
    params: z.object({
      sports: z.array(z.string()).optional(),
      regionIds: z.array(R.RegionId).optional(),
      competitionIds: z.array(R.CompetitionId).optional(),
      select: R.SelectorTree.optional(),
      ...LocaleOnly,
    }),
    result: z.array(R.Match),
  },

  "matches.subscribeLive": {
    params: z.object({
      /**
       * Filter the live stream to one or more sports. Applies to both the initial
       * snapshot and subsequent `match.upd`/`match.del` pushes. Saves
       * bandwidth dramatically vs subscribing globally and filtering
       * client-side.
       */
      sports: z.array(z.string()).optional(),
      /** Filter to one or more regions (additive with `sports`). */
      regionIds: z.array(R.RegionId).optional(),
      /** Filter to one or more competitions (additive with `sports`/`regionIds`). */
      competitionIds: z.array(R.CompetitionId).optional(),
      /**
       * Optional field selector applied to BOTH the initial `snapshot` and
       * subsequent `match.upd` pushes. Saves bandwidth on long-lived live
       * subscriptions where the customer only renders a subset of fields.
       */
      select: R.SelectorTree.optional(),
      ...LocaleOnly,
    }),
    result: z.object({
      sub: z.string(),
      snapshot: z.array(R.Match),
    }),
    pushEvents: ["match.upd", "match.del"] as const,
  },

  "matches.subscribe": {
    params: z.object({
      matchId: R.MatchId,
      /**
       * Optional field selector applied to the initial `snapshot`, `stats.upd`,
       * and `odds.upd` pushes. (`status.upd` is unaffected — it's a single
       * `{status}` field.)
       */
      select: R.SelectorTree.optional(),
      ...LocaleOnly,
    }),
    result: z.object({
      sub: z.string(),
      snapshot: R.MatchDetail,
    }),
    pushEvents: ["stats.upd", "odds.upd", "status.upd"] as const,
  },

  // -------------------------------------------------------------------------
  // AI
  // -------------------------------------------------------------------------

  "ai.picks.list": {
    params: z.object({
      competitionIds: z.array(R.CompetitionId).optional(),
      regionIds: z.array(R.RegionId).optional(),
      status: z.array(R.MatchStatus).optional(),
      ...DateRange,
      ...Cursor,
      ...LocaleOnly,
    }),
    result: z.object({
      data: z.array(R.AiPick),
      pagination: R.Pagination,
    }),
  },

  "ai.recommendations.list": {
    params: z.object({
      matchId: R.MatchId.optional(),
      confidence: R.PickConfidence.optional(),
      /** Minimum edge fraction (0.05 = 5%). */
      minEdge: z.number().min(0).optional(),
      limit: z.number().int().positive().max(100).optional(),
      ...LocaleOnly,
    }),
    result: z.array(R.Recommendation),
  },
} as const

// ---------------------------------------------------------------------------
// Helper types
// ---------------------------------------------------------------------------

export type MethodName = keyof typeof methods
export type MethodDef<M extends MethodName> = (typeof methods)[M]
export type MethodParams<M extends MethodName> = z.infer<MethodDef<M>["params"]>
export type MethodResult<M extends MethodName> = z.infer<MethodDef<M>["result"]>

/** Methods that emit push events (subscriptions). */
export type SubscriptionMethodName = {
  [K in MethodName]: MethodDef<K> extends { pushEvents: readonly string[] } ? K : never
}[MethodName]

export type PushEventsOf<M extends SubscriptionMethodName> =
  MethodDef<M> extends { pushEvents: readonly (infer E)[] } ? E : never
