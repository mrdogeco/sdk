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
    params: z.object({
      apiKey: z.string(),
    }),
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

  // -------------------------------------------------------------------------
  // Discovery
  // -------------------------------------------------------------------------

  "regions.list": {
    params: z.object({
      ...LocaleOnly,
    }),
    result: z.array(R.Region),
  },

  "competitions.list": {
    params: z.object({
      regionId: R.RegionId.optional(),
      sportName: z.string().optional(),
      ...LocaleOnly,
    }),
    result: z.array(R.Competition),
  },

  "teams.list": {
    params: z.object({
      sportName: z.string().optional(),
      regionId: R.RegionId.optional(),
      competitionId: R.CompetitionId.optional(),
      ...LocaleOnly,
    }),
    result: z.array(R.Team),
  },

  // -------------------------------------------------------------------------
  // Matches
  // -------------------------------------------------------------------------

  "matches.list": {
    params: z.object({
      competitionId: R.CompetitionId.optional(),
      regionId: R.RegionId.optional(),
      sportName: z.string().optional(),
      status: z.array(R.MatchStatus).optional(),
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
      ...LocaleOnly,
    }),
    result: R.MatchDetail,
  },

  "matches.trending": {
    params: z.object({
      sportName: z.string().optional(),
      status: z.array(R.MatchStatus).optional(),
      ...LocaleAndTimezone,
    }),
    result: z.array(R.Match),
  },

  "matches.search": {
    params: z.object({
      query: z.string().min(2),
      limit: z.number().int().positive().max(20).optional(),
      ...LocaleOnly,
    }),
    result: z.array(R.Match),
  },

  "matches.subscribeLive": {
    params: z.object({
      sportName: z.string().optional(),
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
      competitionId: R.CompetitionId.optional(),
      regionId: R.RegionId.optional(),
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
