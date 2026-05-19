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
  /**
   * Number of events matching the request's filters (`date`, `sports`,
   * `status`). Present only when at least one filter is provided to
   * `regions.list` — otherwise omitted. Use to size empty states / sort
   * regions by activity without round-tripping `matches.list`.
   */
  eventCount: z.number().int().nonnegative().optional(),
  /** Number of distinct competitions matching the request's filters. */
  competitionCount: z.number().int().nonnegative().optional(),
  /**
   * IDs of competitions present in this region matching the request's
   * filters. Useful for UI logic like "is any priority competition active
   * in this region" without a separate `competitions.list` call. Present
   * only when filters were applied.
   */
  competitionIds: z.array(CompetitionId).optional(),
})
export type Region = z.infer<typeof Region>

export const Competition = z.object({
  id: CompetitionId,
  /** Localized competition name. */
  name: z.string(),
  regionId: RegionId,
  /**
   * Number of events matching the request's filters. Present only when
   * `competitions.list` was called with `date` / `sports` / `status` —
   * otherwise omitted.
   */
  eventCount: z.number().int().nonnegative().optional(),
})
export type Competition = z.infer<typeof Competition>

export const Team = z.object({
  id: TeamId,
  /** Localized team name. */
  name: z.string(),
  sportId: SportId,
})
export type Team = z.infer<typeof Team>

/**
 * Team with embedded sport reference. Returned by `teams.get` for use in
 * team-screen headers and contexts where the consumer hasn't already loaded
 * a match (which would expose `sport` via its embedded refs).
 */
export const TeamDetail = z.object({
  id: TeamId,
  name: z.string(),
  sport: z.object({ id: SportId, name: z.string() }).nullable(),
})
export type TeamDetail = z.infer<typeof TeamDetail>

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
 * Player-level stat entry, e.g. `{ name: "Lionel Messi", value: 2 }` for
 * goals/assists/fouls per player. Surfaced as arrays on MatchStats.
 */
export const StatPlayer = z.object({
  name: z.string(),
  value: z.number(),
})
export type StatPlayer = z.infer<typeof StatPlayer>

/**
 * Coarse match state — drives top-level UI logic without needing to parse
 * the sport-specific phase enum. Absorbs the legacy `isLive` / `isInPlay` /
 * `isInPlayPaused` / `isInterrupted` booleans.
 */
export const MatchState = z.enum([
  "scheduled",     // pre-match, no clock running
  "live",          // active play
  "paused",        // brief stoppage (VAR, ref whistle, timeout)
  "intermission",  // halftime, between quarters/periods/sets/innings
  "interrupted",   // suspended (weather, abandoned, etc.)
  "finished",      // match concluded
])
export type MatchState = z.infer<typeof MatchState>

/**
 * One period in a match (a quarter, half, set, inning, etc.). Unified
 * across sports — replaces upstream `quarterScores` / `periodScores` /
 * `inningScores` / `setScores` / `phaseScores`.
 *
 * Soccer rarely has per-period scores in the upstream payload and may emit
 * an empty `periods` array.
 */
export const Period = z.object({
  /**
   * Stable sport-defined code, e.g. `"Q1"`, `"OT"`, `"HT"`, `"INN_9"`.
   * `null` for sports where upstream doesn't expose a stable code.
   */
  code: z.string().nullable(),
  /** Localized display label, e.g. `"1º P"`, `"Inning 9"`. */
  label: z.string(),
  /** Score for the home team in this period. `null` if not yet played. */
  homeScore: z.number().nullable(),
  /** Score for the away team in this period. `null` if not yet played. */
  awayScore: z.number().nullable(),
  /** Whether this period is the one currently in progress. */
  inPlay: z.boolean(),
})
export type Period = z.infer<typeof Period>

/**
 * Unified match clock + phase + state. Replaces the legacy bag of fields
 * (`isLive`, `isInPlay`, `isInPlayPaused`, `isInterrupted`, `elapsed`,
 * `elapsedSeconds`, `referenceTime`, `referenceTimeUnix`, `adjustTimeMillis`,
 * `injuryMinutes`, `minute`, `phaseCaption`, `phaseCaptionLong`, `phase`).
 *
 * Handles both count-up clocks (soccer, baseball-style) and count-down
 * clocks (basketball, ice hockey, american football, handball), as well as
 * sports without a traditional clock (volleyball, baseball).
 *
 * Consumer DX, by ambition level:
 *   - **Lazy**: render `display` directly. Server has already formatted
 *     the right string ("44'", "Q3 7:42", "HT", "FT", "Top 9th", "Set 4")
 *     and localized it where possible.
 *   - **Custom labels**: switch on `state` and use the numeric fields
 *     (`minute`/`stoppage` for soccer, `remainingSeconds` /
 *     `elapsedSeconds` for count-down sports) to format your own.
 *   - **Fluid second-by-second**: interpolate from `referenceTime` +
 *     `elapsedSeconds` between server pushes. Customer drift formula:
 *
 *       liveSec = elapsedSeconds + (Date.now() - new Date(referenceTime)) / 1000
 */
export const Clock = z.object({
  /**
   * Stable machine-readable phase, e.g. `"SOCCER_MATCH_SECOND_HALF"`,
   * `"BASKETBALL_GAME_OVERTIME"`. Useful for sport-specific UI logic.
   * `null` when phase is unknown.
   */
  phase: z.string().nullable(),

  /** Coarse display state — drives UI logic. */
  state: MatchState,

  /**
   * Pre-formatted localized **short** display string. Server picks the
   * right format per sport/phase: `"44'"`, `"45+3'"`, `"Q3 7:42"`, `"HT"`,
   * `"FT"`, `"9º Inning"`. Localized via the subscription `locale` param
   * (en/pt/es supported; unknown locales fall back to en, then to the
   * upstream source string). `null` when no clock label is meaningful.
   */
  display: z.string().nullable(),

  /**
   * Pre-formatted localized **long** display string — the verbose form
   * suited to a detail header. Examples: `"Half-time"`, `"Full Time"`,
   * `"2nd Half"`, `"Overtime 0:01"`, `"3rd Quarter 7:42"`. Same
   * localization rules as `display`. `null` when no long form exists
   * (e.g. soccer running clock — the minute IS the display).
   */
  displayLong: z.string().nullable(),

  // ---- Numeric clock values (for customers who format their own clocks) --

  /**
   * The value on the displayed clock, in seconds, captured at
   * `referenceTime`. Sport-specific semantics:
   *   - Soccer: total match-elapsed (e.g. 2700 = 45:00, 5400 = 90:00).
   *   - Basketball / ice hockey / american football / handball: elapsed
   *     within the current period (period clock counts up under the hood).
   *   - Baseball / volleyball: `null` (no traditional clock).
   *
   * Pair with `referenceTime` to drift your own ticker:
   *   liveSec = elapsedSeconds + (Date.now() - new Date(referenceTime)) / 1000
   *
   * `null` when no clock is active.
   */
  elapsedSeconds: z.number().nullable(),

  /**
   * Seconds remaining on the displayed clock for count-down sports
   * (basketball, ice hockey, american football, handball). `null` for
   * count-up sports and sports without a clock.
   */
  remainingSeconds: z.number().nullable(),

  /**
   * Total duration of the current period in seconds (e.g. 720 for an NBA
   * quarter, 2700 for a soccer half). `null` when the period has no
   * fixed duration.
   */
  periodDurationSeconds: z.number().nullable(),

  // ---- Soccer-specific running minute + stoppage --------------------------

  /**
   * Running match minute capped at the phase max (45 in 1st half, 90 in
   * 2nd half, 105 / 120 for extra time). Soccer only. `null` for sports
   * without a continuous minute counter, or when not currently ticking
   * (intermission, finished).
   */
  minute: z.number().int().nullable(),

  /**
   * Stoppage-time overflow in minutes, e.g. `3` for "45+3'". Soccer only.
   * `null` outside stoppage time.
   */
  stoppage: z.number().int().nullable(),

  // ---- Interpolation anchor ----------------------------------------------

  /**
   * ISO-8601 anchor time for client-side interpolation. Pair with
   * `elapsedInPeriod` to drift your own ticker between server pushes.
   * `null` when interpolation is not meaningful (intermission, finished,
   * sports without a clock).
   */
  referenceTime: z.string().nullable(),
})
export type Clock = z.infer<typeof Clock>

/**
 * Live match statistics, unified across all supported sports
 * (soccer, basketball, american football, baseball, ice hockey,
 * volleyball, handball).
 *
 * Coarse-grained by design — every stats update carries the full latest
 * state (see PROTOCOL.md §7). Clients replace, never merge.
 *
 * Default-strip mode (no `.passthrough()` / `.strict()`): unknown server
 * fields are dropped on parse, so the public contract is the explicit
 * field list below. Forward-compatible if the server adds a field the
 * client doesn't know yet — the client just ignores it.
 *
 * Sport semantics for the primary `homeScore`/`awayScore`:
 *   - Soccer / Ice Hockey: goals
 *   - Basketball / American Football: points
 *   - Baseball: runs
 *   - Volleyball: sets won (per-set point totals live in `periods`)
 *   - Handball: goals
 *
 * Customers infer the unit from `sport.name` on the parent `Match`.
 */
export const MatchStats = z.object({
  // ---- UI hint -----------------------------------------------------------
  /** If true, customers should hide stats UI for this match. */
  hideStats: z.boolean().optional(),

  // ---- Unified clock + state + phase ------------------------------------
  /** Unified clock object — see Clock. `null` when no clock data. */
  clock: Clock.nullable(),

  // ---- Per-period breakdown ---------------------------------------------
  /**
   * Per-period scores (quarters, halves, sets, innings, etc.). Empty for
   * sports that don't expose a per-period breakdown.
   */
  periods: z.array(Period).optional(),

  // ---- Primary score (unified across all sports) -------------------------
  /** Primary home score (goals / points / runs / sets — see header doc). */
  homeScore: z.number().int(),
  /** Primary away score (goals / points / runs / sets — see header doc). */
  awayScore: z.number().int(),

  // ---- Cards (mainly soccer) --------------------------------------------
  homeYellowCards: z.number().int().optional(),
  awayYellowCards: z.number().int().optional(),
  homeRedCards: z.number().int().optional(),
  awayRedCards: z.number().int().optional(),

  // ---- Fouls (soccer, basketball) ---------------------------------------
  homeFouls: z.number().int().optional(),
  awayFouls: z.number().int().optional(),

  // ---- Soccer-specific team stats ---------------------------------------
  homeCorners: z.number().int().optional(),
  awayCorners: z.number().int().optional(),
  homeTackles: z.number().int().optional(),
  awayTackles: z.number().int().optional(),
  homeOffsides: z.number().int().optional(),
  awayOffsides: z.number().int().optional(),
  homeThrowIns: z.number().int().optional(),
  awayThrowIns: z.number().int().optional(),
  homeGoalKicks: z.number().int().optional(),
  awayGoalKicks: z.number().int().optional(),
  homePenaltyKicks: z.number().int().optional(),
  awayPenaltyKicks: z.number().int().optional(),
  /** Soccer ball-possession share, 0–1 (e.g. 0.62 = 62%). */
  homePossession: z.number().min(0).max(1).optional(),
  awayPossession: z.number().min(0).max(1).optional(),
  homeShots: z.number().int().optional(),
  awayShots: z.number().int().optional(),
  homeShotsOnTarget: z.number().int().optional(),
  awayShotsOnTarget: z.number().int().optional(),
  homeExpectedGoals: z.number().optional(),
  awayExpectedGoals: z.number().optional(),
  homeWoodworkHits: z.number().int().optional(),
  awayWoodworkHits: z.number().int().optional(),

  // ---- Basketball-specific ----------------------------------------------
  /** Whether the team has reached the foul threshold for free throws. */
  homeIsBonus: z.boolean().optional(),
  awayIsBonus: z.boolean().optional(),
  /** Whether the team currently has the ball (basketball discrete possession). */
  homeHasPossession: z.boolean().optional(),
  awayHasPossession: z.boolean().optional(),

  // ---- Baseball-specific ------------------------------------------------
  outs: z.number().int().optional(),
  balls: z.number().int().optional(),
  strikes: z.number().int().optional(),
  /**
   * Base-runner state. Shape is upstream-defined; passthrough for now.
   * Will be promoted to a typed schema once we settle the contract.
   */
  bases: z.array(z.unknown()).optional(),

  // ---- Volleyball-specific ----------------------------------------------
  /** Whether the team is currently serving. */
  homeServes: z.boolean().optional(),
  awayServes: z.boolean().optional(),

  // ---- Player-level arrays (soccer) -------------------------------------
  homePlayersGoals: z.array(StatPlayer).optional(),
  awayPlayersGoals: z.array(StatPlayer).optional(),
  homePlayersAssists: z.array(StatPlayer).optional(),
  awayPlayersAssists: z.array(StatPlayer).optional(),
  homePlayersFouls: z.array(StatPlayer).optional(),
  awayPlayersFouls: z.array(StatPlayer).optional(),
  homePlayersShots: z.array(StatPlayer).optional(),
  awayPlayersShots: z.array(StatPlayer).optional(),
  homePlayersShotsOnTarget: z.array(StatPlayer).optional(),
  awayPlayersShotsOnTarget: z.array(StatPlayer).optional(),
  homePlayersTackles: z.array(StatPlayer).optional(),
  awayPlayersTackles: z.array(StatPlayer).optional(),
  homePlayersOffsides: z.array(StatPlayer).optional(),
  awayPlayersOffsides: z.array(StatPlayer).optional(),
  homePlayersWoodworkHits: z.array(StatPlayer).optional(),
  awayPlayersWoodworkHits: z.array(StatPlayer).optional(),

  // ---- Live betting markets ---------------------------------------------
  /**
   * Live-betting market snapshots. Shape is upstream-defined for now; will
   * be promoted to a typed schema once we settle the public contract.
   */
  liveBetItems: z.array(z.unknown()).optional(),
})
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

// ---------------------------------------------------------------------------
// Field selectors — GraphQL-style response projection
// ---------------------------------------------------------------------------

/**
 * Recursive selector type — letters the customer pick which fields of a
 * response are returned. Mirrors the shape of the target type via TypeScript
 * conditional types so autocomplete works.
 *
 *   - `field: true`       → include the full subtree
 *   - `field: { …nested }` → include only the listed nested fields
 *   - field omitted       → not returned
 *
 * Wire format: a nested JSON object with `true` leaves. The server walks
 * both the response and the selector in lockstep and emits only what
 * matched. When `select` is undefined the server returns the full default
 * shape (no projection applied).
 *
 * Example:
 *   select: {
 *     id: true,
 *     homeTeam: true,
 *     competition: { name: true },
 *     stats: { clock: { display: true }, homeScore: true, awayScore: true },
 *     markets: true,
 *   }
 */
export type Selector<T> = T extends ReadonlyArray<infer U>
  ? Selector<U>
  : T extends Date
    ? true
    : T extends object
      ? { [K in keyof T]?: true | Selector<NonNullable<T[K]>> }
      : true

/**
 * Permissive runtime schema for selectors. Doesn't enforce the target type's
 * shape — that's the TypeScript compiler's job. The server validates fields
 * against the actual response and silently drops keys that don't exist.
 */
type SelectorTreeValue = boolean | { [k: string]: SelectorTreeValue }
export const SelectorTree: z.ZodType<SelectorTreeValue> = z.lazy(() =>
  z.union([z.boolean(), z.record(z.string(), SelectorTree)]),
)

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

/** Convenience alias — typed selector for the `Match` shape. */
export type MatchSelect = Selector<Match>

/**
 * Full match detail returned by `matches.get` and as the initial snapshot of
 * `matches.subscribe`. Carries every market and current stats.
 */
export const MatchDetail = Match.extend({
  views: z.number().int().nonnegative().optional(),
})
export type MatchDetail = z.infer<typeof MatchDetail>

/** Convenience alias — typed selector for the `MatchDetail` shape. */
export type MatchDetailSelect = Selector<MatchDetail>

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

// ---------------------------------------------------------------------------
// Team form (W/D/L aggregate over a team's recent completed matches)
// ---------------------------------------------------------------------------

export const TeamFormResult = z.enum(["win", "loss", "draw", "unknown"])
export type TeamFormResult = z.infer<typeof TeamFormResult>

export const TeamFormMatch = z.object({
  matchId: MatchId,
  startedAt: z.string().datetime({ offset: true }),
  competition: z.object({
    id: CompetitionId,
    name: z.string().nullable(),
    region: z.string().nullable(),
  }),
  homeTeam: TeamRef,
  awayTeam: TeamRef,
  opponent: TeamRef,
  isHome: z.boolean(),
  score: z.object({
    /** Goals scored by the queried team. */
    for: z.number().int().nullable(),
    /** Goals conceded by the queried team. */
    against: z.number().int().nullable(),
    home: z.number().int().nullable(),
    away: z.number().int().nullable(),
  }),
  result: TeamFormResult,
})
export type TeamFormMatch = z.infer<typeof TeamFormMatch>

export const TeamForm = z.object({
  team: TeamDetail,
  summary: z.object({
    wins: z.number().int().nonnegative(),
    draws: z.number().int().nonnegative(),
    losses: z.number().int().nonnegative(),
    goalsFor: z.number().int().nonnegative(),
    goalsAgainst: z.number().int().nonnegative(),
    sampleSize: z.number().int().nonnegative(),
    /** Recent W/D/L codes, most-recent first. */
    form: z.array(z.string()),
    /** Current streak label, e.g. "W3", "L2", or "". */
    streak: z.string(),
  }),
  matches: z.array(TeamFormMatch),
})
export type TeamForm = z.infer<typeof TeamForm>

// ---------------------------------------------------------------------------
// AI
// ---------------------------------------------------------------------------

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
