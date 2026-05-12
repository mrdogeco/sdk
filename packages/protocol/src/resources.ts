import { z } from "zod"

// ---------------------------------------------------------------------------
// Identifiers
// ---------------------------------------------------------------------------

export const RegionId = z.number().int().positive()
export const CompetitionId = z.number().int().positive()
export const TeamId = z.number().int().positive()
export const SportId = z.number().int().positive()

/** Event/match ID. Strings, not numbers — matches the database. */
export const MatchId = z.string().min(1)
export const MarketId = z.string().min(1)
export const BetItemId = z.string().min(1)

export type RegionId = z.infer<typeof RegionId>
export type CompetitionId = z.infer<typeof CompetitionId>
export type TeamId = z.infer<typeof TeamId>
export type SportId = z.infer<typeof SportId>
export type MatchId = z.infer<typeof MatchId>
export type MarketId = z.infer<typeof MarketId>
export type BetItemId = z.infer<typeof BetItemId>

// ---------------------------------------------------------------------------
// Discovery resources
// ---------------------------------------------------------------------------

export const Sport = z.object({
  id: SportId,
  name: z.string(),
})
export type Sport = z.infer<typeof Sport>

export const Region = z.object({
  id: RegionId,
  /** Localized region name (e.g. "England" / "Inglaterra"). Translation is server-side. */
  name: z.string(),
})
export type Region = z.infer<typeof Region>

export const Competition = z.object({
  id: CompetitionId,
  /** Localized competition name. */
  name: z.string(),
  regionId: RegionId,
})
export type Competition = z.infer<typeof Competition>

export const Team = z.object({
  id: TeamId,
  /** Localized team name. */
  name: z.string(),
  sportId: SportId,
})
export type Team = z.infer<typeof Team>

// ---------------------------------------------------------------------------
// Lean references embedded inside Match
// ---------------------------------------------------------------------------

const TeamRef = z.object({
  id: TeamId,
  name: z.string(),
})

const CompetitionRef = z.object({
  id: CompetitionId,
  name: z.string(),
})

const RegionRef = z.object({
  id: RegionId,
  name: z.string(),
})

const SportRef = z.object({
  id: SportId,
  name: z.string(),
})

// ---------------------------------------------------------------------------
// Match
// ---------------------------------------------------------------------------

export const MatchStatus = z.enum(["upcoming", "live", "completed"])
export type MatchStatus = z.infer<typeof MatchStatus>

/**
 * Live match statistics. Soccer fields are first-class; other sports use
 * `passthrough` to surface their own fields without forcing a schema change.
 *
 * Coarse-grained by design — every stats update carries the full latest state
 * (see PROTOCOL.md §7). Clients replace, never merge.
 */
export const MatchStats = z
  .object({
    minute: z.number().int().nullable().optional(),
    phase: z.string().nullable().optional(),
    phaseCaption: z.string().nullable().optional(),

    homeGoals: z.number().int(),
    awayGoals: z.number().int(),

    homeCorners: z.number().int().optional(),
    awayCorners: z.number().int().optional(),

    homeYellowCards: z.number().int().optional(),
    awayYellowCards: z.number().int().optional(),

    homeRedCards: z.number().int().optional(),
    awayRedCards: z.number().int().optional(),

    homePossession: z.number().min(0).max(1).optional(),
    awayPossession: z.number().min(0).max(1).optional(),

    homeShots: z.number().int().optional(),
    awayShots: z.number().int().optional(),
    homeShotsOnTarget: z.number().int().optional(),
    awayShotsOnTarget: z.number().int().optional(),
  })
  .passthrough()
export type MatchStats = z.infer<typeof MatchStats>

export const BetItem = z.object({
  id: BetItemId,
  /** Outcome code, e.g. "1", "X", "2", "O2.5", "GG". */
  code: z.string(),
  /** Display label, e.g. "Over 2.5". May be null for code-only items. */
  caption: z.string().nullable(),
  /** Decimal odds (e.g. 2.10). Other formats are not negotiated in v1. */
  price: z.number().positive(),
  isAvailable: z.boolean(),
})
export type BetItem = z.infer<typeof BetItem>

export const Market = z.object({
  id: MarketId,
  /** Market sysname, e.g. "SOCCER_MATCH_RESULT", "SOCCER_UNDER_OVER". */
  betType: z.string(),
  betItems: z.array(BetItem),
})
export type Market = z.infer<typeof Market>

/**
 * Match shape returned by list/search/trending endpoints. Lean by design;
 * includes the two most relevant markets (match result + under/over). For
 * full markets + stats, use `matches.get` or `matches.subscribe`.
 */
export const Match = z.object({
  id: MatchId,
  startTime: z.string().datetime({ offset: true }),
  status: MatchStatus,
  homeTeam: TeamRef,
  awayTeam: TeamRef,
  sport: SportRef.nullable(),
  competition: CompetitionRef,
  region: RegionRef,
  markets: z.array(Market),
  /** Present only on `completed` matches in list responses. */
  stats: MatchStats.nullable().optional(),
})
export type Match = z.infer<typeof Match>

/**
 * Full match detail returned by `matches.get` and as the initial snapshot of
 * `matches.subscribe`. Carries every market and current stats.
 */
export const MatchDetail = Match.extend({
  views: z.number().int().nonnegative().optional(),
})
export type MatchDetail = z.infer<typeof MatchDetail>

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

/**
 * Cursor pagination envelope. `nextCursor` is opaque base64 — clients MUST NOT
 * parse it. See PROTOCOL.md §6.
 */
export const Pagination = z.object({
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
})
export type Pagination = z.infer<typeof Pagination>

// ---------------------------------------------------------------------------
// AI: picks + recommendations
// ---------------------------------------------------------------------------

export const PickConfidence = z.enum(["High", "Medium", "Low"])
export type PickConfidence = z.infer<typeof PickConfidence>

export const PickResult = z.enum(["won", "lost", "push"]).nullable()
export type PickResult = z.infer<typeof PickResult>

const PickLeg = z.object({
  marketId: MarketId,
  /** The recommended outcome label (e.g. "Over 2.5", "Home Win"). */
  outcome: z.string(),
  /** Decimal odds at pick time. */
  odds: z.number().positive(),
  /** Optional handicap/total line, e.g. 2.5 for over/under markets. */
  point: z.number().nullable().optional(),
  confidence: PickConfidence,
  /** Server-computed edge over fair odds, as a fraction (0.05 = 5%). */
  edgePercentage: z.number().nullable().optional(),
  /** Mr. Doge's reasoning for this pick, localized. */
  rationale: z.array(z.string()),
})
export type PickLeg = z.infer<typeof PickLeg>

export const AiPick = z.object({
  id: z.string(),
  matchId: MatchId,
  /** Embedded match summary, if requested or available. */
  match: Match.optional(),
  pickType: z.string(),
  legs: z.array(PickLeg),
  totalOdds: z.number().positive(),
  expiresAt: z.string().datetime({ offset: true }),
  settled: z.boolean(),
  result: PickResult,
  createdAt: z.string().datetime({ offset: true }),
})
export type AiPick = z.infer<typeof AiPick>

export const Recommendation = z.object({
  id: z.string(),
  matchId: MatchId,
  match: Match.optional(),
  marketId: MarketId,
  betItemId: BetItemId.nullable().optional(),
  outcome: z.string(),
  odds: z.number().positive(),
  point: z.number().nullable().optional(),
  confidence: PickConfidence,
  /** Edge as a fraction (0.05 = 5%). */
  edgePercentage: z.number(),
  kellyFraction: z.number().optional(),
  rationale: z.array(z.string()),
  riskFactors: z.array(z.string()),
  settled: z.boolean(),
  result: PickResult,
  createdAt: z.string().datetime({ offset: true }),
})
export type Recommendation = z.infer<typeof Recommendation>
