import { z } from "zod"
import { Match, MatchDetail, MatchStats, Market, MatchStatus, MatchId } from "./resources"

// ---------------------------------------------------------------------------
// `welcome` notification — sent once after successful `auth`
// ---------------------------------------------------------------------------

export const WelcomeParams = z.object({
  protocolVersion: z.number().int(),
  serverVersion: z.string(),
  /** Tier of the authenticated key, e.g. "free", "pro", "enterprise". */
  tier: z.string(),
  rateLimit: z.object({
    requestsPerMinute: z.number().int().positive(),
    subscriptionsMax: z.number().int().nonnegative(),
  }),
})
export type WelcomeParams = z.infer<typeof WelcomeParams>

// ---------------------------------------------------------------------------
// `subscription.event` notifications — one per push event type
// ---------------------------------------------------------------------------

/** Push event names. Keep these terse — they go over the wire on every update. */
export const SubscriptionEventName = z.enum([
  "match.upd",     // matches.subscribeLive: a match's state changed
  "match.del",     // matches.subscribeLive: a match dropped off the live list
  "stats.upd",     // matches.subscribe: latest stats
  "odds.upd",      // matches.subscribe: latest markets
  "status.upd",    // matches.subscribe: status transition
])
export type SubscriptionEventName = z.infer<typeof SubscriptionEventName>

const SubMatchUpd = z.object({
  sub: z.string(),
  event: z.literal("match.upd"),
  data: Match,
})

const SubMatchDel = z.object({
  sub: z.string(),
  event: z.literal("match.del"),
  data: z.object({ id: MatchId }),
})

const SubStatsUpd = z.object({
  sub: z.string(),
  event: z.literal("stats.upd"),
  data: MatchStats,
})

const SubOddsUpd = z.object({
  sub: z.string(),
  event: z.literal("odds.upd"),
  data: z.object({ markets: z.array(Market) }),
})

const SubStatusUpd = z.object({
  sub: z.string(),
  event: z.literal("status.upd"),
  data: z.object({ status: MatchStatus }),
})

/**
 * Discriminated union of every `subscription.event` payload shape.
 * Server emits one of these as `params` on the `subscription.event` notification.
 * Clients route by `sub` to the right subscription handle, then by `event` to
 * the right typed callback.
 */
export const SubscriptionEventParams = z.discriminatedUnion("event", [
  SubMatchUpd,
  SubMatchDel,
  SubStatsUpd,
  SubOddsUpd,
  SubStatusUpd,
])
export type SubscriptionEventParams = z.infer<typeof SubscriptionEventParams>

// ---------------------------------------------------------------------------
// `subscription.closed` — server-initiated terminal notification
// ---------------------------------------------------------------------------

export const SubscriptionClosedReason = z.enum([
  "server_shutdown",
  "key_revoked",
  "account_suspended",
  "data_unavailable",
  "internal_error",
])
export type SubscriptionClosedReason = z.infer<typeof SubscriptionClosedReason>

export const SubscriptionClosedParams = z.object({
  sub: z.string(),
  reason: SubscriptionClosedReason,
  message: z.string().optional(),
})
export type SubscriptionClosedParams = z.infer<typeof SubscriptionClosedParams>

// ---------------------------------------------------------------------------
// Notification method names
// ---------------------------------------------------------------------------

/**
 * Every notification (`id`-less server frame) carries one of these as `method`.
 */
export const NotificationName = z.enum([
  "welcome",
  "subscription.event",
  "subscription.closed",
])
export type NotificationName = z.infer<typeof NotificationName>
