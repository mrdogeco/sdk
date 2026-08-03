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

// ---------------------------------------------------------------------------
// MatchStats — discriminated union, one variant per supported sport
// ---------------------------------------------------------------------------

/**
 * Supported sport names — the discriminant tag on `MatchStats` variants.
 * Matches `match.sport.name` on the parent Match. New sports get added
 * here AND a corresponding stats variant below.
 */
export const SportName = z.enum([
  "soccer",
  "basketball",
  "american_football",
  "baseball",
  "ice_hockey",
  "volleyball",
  "handball",
  "tennis",
])
export type SportName = z.infer<typeof SportName>

/**
 * Fields shared by every sport variant. Pulled into a constants object so
 * each variant `.extend()`s the same baseline — clock + periods + primary
 * score. Per-sport variants add their sport-specific stats on top.
 *
 * Sport semantics for `homeScore`/`awayScore`:
 *   - Soccer / Ice Hockey / Handball: goals scored
 *   - Basketball / American Football: total points
 *   - Baseball: total runs
 *   - Volleyball / Tennis: sets won (per-set point totals live in `periods`)
 */
const StatsBase = {
  clock: Clock.nullable(),
  periods: z.array(Period).optional(),
  homeScore: z.number().int(),
  awayScore: z.number().int(),
} as const

// ---- Soccer ---------------------------------------------------------------

export const SoccerStats = z.object({
  sport: z.literal("soccer"),
  ...StatsBase,
  // Cards
  homeYellowCards: z.number().int().optional(),
  awayYellowCards: z.number().int().optional(),
  homeRedCards: z.number().int().optional(),
  awayRedCards: z.number().int().optional(),
  // Fouls
  homeFouls: z.number().int().optional(),
  awayFouls: z.number().int().optional(),
  // Set-piece counts
  homeCorners: z.number().int().optional(),
  awayCorners: z.number().int().optional(),
  homeThrowIns: z.number().int().optional(),
  awayThrowIns: z.number().int().optional(),
  homeGoalKicks: z.number().int().optional(),
  awayGoalKicks: z.number().int().optional(),
  homePenaltyKicks: z.number().int().optional(),
  awayPenaltyKicks: z.number().int().optional(),
  // Play stats
  homeTackles: z.number().int().optional(),
  awayTackles: z.number().int().optional(),
  homeOffsides: z.number().int().optional(),
  awayOffsides: z.number().int().optional(),
  homeShots: z.number().int().optional(),
  awayShots: z.number().int().optional(),
  homeShotsOnTarget: z.number().int().optional(),
  awayShotsOnTarget: z.number().int().optional(),
  homeWoodworkHits: z.number().int().optional(),
  awayWoodworkHits: z.number().int().optional(),
  /** Ball-possession share as a 0–1 fraction (e.g. `0.62` = 62%). */
  homePossession: z.number().min(0).max(1).optional(),
  awayPossession: z.number().min(0).max(1).optional(),
  // Expected goals (xG)
  homeExpectedGoals: z.number().optional(),
  awayExpectedGoals: z.number().optional(),
  /** Total stoppage/injury time announced in the current half. */
  injuryMinutes: z.number().int().optional(),
  // Player-level breakdowns
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
})
export type SoccerStats = z.infer<typeof SoccerStats>

// ---- Tennis --------------------------------------------------------------

/**
 * Tennis primary score = sets won. The upstream feed uses
 * `player1*`/`player2*` field names which we normalize to
 * `home*`/`away*` (player1 → home).
 */
export const TennisStats = z.object({
  sport: z.literal("tennis"),
  ...StatsBase,
  /** Games won in the current (in-progress) set. */
  homeGamesInCurrentSet: z.number().int().optional(),
  awayGamesInCurrentSet: z.number().int().optional(),
  /** Points in the current game, formatted: `"0"` / `"15"` / `"30"` / `"40"` / `"AD"`. */
  homeCurrentGamePoints: z.string().optional(),
  awayCurrentGamePoints: z.string().optional(),
  /** Who is currently serving (mutually exclusive). */
  homeServes: z.boolean().optional(),
  awayServes: z.boolean().optional(),
  /** True when the current game is a tiebreak. */
  isInTieBreak: z.boolean().optional(),
  /** Match format: 3 (best-of-3) or 5 (best-of-5). */
  numberOfSets: z.number().int().optional(),
  /** Court surface code as reported by the data feed (provider-specific). */
  courtType: z.number().int().optional(),
})
export type TennisStats = z.infer<typeof TennisStats>

// ---- Basketball ----------------------------------------------------------

export const BasketballStats = z.object({
  sport: z.literal("basketball"),
  ...StatsBase,
  homeFouls: z.number().int().optional(),
  awayFouls: z.number().int().optional(),
  /** Whether the team has reached the foul threshold for free-throw bonus. */
  homeIsBonus: z.boolean().optional(),
  awayIsBonus: z.boolean().optional(),
  /** Discrete ball possession (mutually exclusive). */
  homeHasPossession: z.boolean().optional(),
  awayHasPossession: z.boolean().optional(),
})
export type BasketballStats = z.infer<typeof BasketballStats>

// ---- American Football ---------------------------------------------------

export const AmericanFootballStats = z.object({
  sport: z.literal("american_football"),
  ...StatsBase,
})
export type AmericanFootballStats = z.infer<typeof AmericanFootballStats>

// ---- Baseball ------------------------------------------------------------

export const BaseballStats = z.object({
  sport: z.literal("baseball"),
  ...StatsBase,
  /** Current at-bat state. */
  outs: z.number().int().optional(),
  balls: z.number().int().optional(),
  strikes: z.number().int().optional(),
  /** Base-runner state. Shape passthrough until upstream contract stabilizes. */
  bases: z.array(z.unknown()).optional(),
})
export type BaseballStats = z.infer<typeof BaseballStats>

// ---- Ice Hockey ----------------------------------------------------------

export const IceHockeyStats = z.object({
  sport: z.literal("ice_hockey"),
  ...StatsBase,
})
export type IceHockeyStats = z.infer<typeof IceHockeyStats>

// ---- Volleyball ----------------------------------------------------------

export const VolleyballStats = z.object({
  sport: z.literal("volleyball"),
  ...StatsBase,
  /** Who is currently serving (mutually exclusive). */
  homeServes: z.boolean().optional(),
  awayServes: z.boolean().optional(),
})
export type VolleyballStats = z.infer<typeof VolleyballStats>

// ---- Handball ------------------------------------------------------------

export const HandballStats = z.object({
  sport: z.literal("handball"),
  ...StatsBase,
})
export type HandballStats = z.infer<typeof HandballStats>

// ---- Discriminated union -------------------------------------------------

/**
 * Live match statistics. Discriminated by `sport` — narrow with
 * `if (match.stats?.sport === "tennis") { … }` to access sport-specific
 * fields. Common fields (`clock`, `periods`, `homeScore`, `awayScore`)
 * are typed without narrowing.
 *
 * Coarse-grained by design — every stats update carries the full latest
 * state (see PROTOCOL.md §7). Clients replace, never merge.
 */
export const MatchStats = z.discriminatedUnion("sport", [
  SoccerStats,
  TennisStats,
  BasketballStats,
  AmericanFootballStats,
  BaseballStats,
  IceHockeyStats,
  VolleyballStats,
  HandballStats,
])
export type MatchStats = z.infer<typeof MatchStats>

// ---------------------------------------------------------------------------
// Timeline — sport-tagged event log
// ---------------------------------------------------------------------------

/**
 * Single timeline event. The shape is uniform across sports; the `type`
 * field is sport-specific (see per-sport unions below — `SoccerTimelineEventType`
 * etc. — for the known values).
 *
 * Sides are normalized: tennis `player1`/`player2` and the upstream `P1`/`P2`
 * codes both collapse to `"home"` / `"away"`. Game-level events
 * (start-of-match, end-of-period scoreboards) carry `side: "match"`.
 *
 * `captions` shape varies by event type. Examples per sport are in
 * `reference/matches.mdx`. The first element is typically a time marker;
 * remaining elements are team / player / score data.
 */
export const TimelineEvent = z.object({
  /**
   * Event kind. Open string — see `SoccerTimelineEventType` /
   * `TennisTimelineEventType` / etc. for the documented values per sport.
   * New event types may appear without an SDK update.
   */
  type: z.string(),
  /**
   * Which side the event belongs to. `"match"` is used for events that
   * apply to the whole match (start/end of periods, halftime scoreboards).
   */
  side: z.enum(["home", "away", "match"]),
  /**
   * Phase identifier where the event occurred — `"1H"`/`"2H"` (soccer,
   * handball), `"Q1"`–`"Q4"`/`"OT"` (basketball, American football),
   * `"P1"`–`"P3"`/`"OT"` (ice hockey), `"S1"`–`"S5"`/`"TB"` (tennis,
   * volleyball).
   */
  phase: z.string(),
  /**
   * Display strings — sport- and type-specific. See per-sport docs for
   * positional meaning.
   */
  captions: z.array(z.string()),
  /**
   * Time offset from match start, in seconds. `0` for events that don't
   * carry an in-play time (start-of-period markers, end-of-period
   * scoreboards).
   */
  timeOffsetSeconds: z.number().int().nonnegative(),
})
export type TimelineEvent = z.infer<typeof TimelineEvent>

// ---- Per-sport `type` unions (TypeScript only) ---------------------------
// These are TS-level helpers for narrowing `TimelineEvent.type` per sport.
// They're not enforced at runtime — the wire format allows any string so
// new event types from upstream don't fail validation. Cast or compare to
// these strings inside an `if (match.sport?.name === "...")` block.

export type SoccerTimelineEventType =
  | "StartOfMatch"
  | "EndOfFirstHalf"
  | "StartOfSecondHalf"
  | "EndOfNormalTime"
  | "GoalWithScorer"
  | "OwnGoal"
  | "ShotWithPlayer"
  | "ShotOnTargetWithPlayer"
  | "FoulWithPlayer"
  | "TackleWithPlayer"
  | "ThrowIn"
  | "GoalKick"
  | "Corner"
  | "PenaltyKick"
  | "YellowCardWithPlayer"
  | "RedCardWithPlayer"
  | "Substitution"

export type TennisTimelineEventType =
  | "GameWithPoints"
  | "Game"
  | "Set"
  | "Tiebreak"

export type BasketballTimelineEventType =
  | "StartOfGame"
  | "EndOfFirstQuarter"
  | "StartOfSecondQuarter"
  | "EndOfHalfTime"
  | "StartOfThirdQuarter"
  | "EndOfThirdQuarter"
  | "StartOfFourthQuarter"
  | "EndOfFourthQuarter"
  | "StartOfOvertime"
  | "EndOfOvertime"

export type AmericanFootballTimelineEventType =
  | "StartOfGame"
  | "EndOfFirstQuarter"
  | "StartOfSecondQuarter"
  | "EndOfHalfTime"
  | "StartOfThirdQuarter"
  | "EndOfThirdQuarter"
  | "StartOfFourthQuarter"
  | "EndOfFourthQuarter"
  | "StartOfOvertime"
  | "EndOfOvertime"

export type IceHockeyTimelineEventType =
  | "StartOfGame"
  | "EndOfFirstPeriod"
  | "StartOfSecondPeriod"
  | "EndOfSecondPeriod"
  | "StartOfThirdPeriod"
  | "EndOfThirdPeriod"
  | "StartOfOvertime"
  | "EndOfOvertime"
  | "GoalWithoutScorer"

export type VolleyballTimelineEventType =
  | "SetWithPoints"
  | "Set"

export type HandballTimelineEventType =
  | "StartOfGame"
  | "EndOfFirstHalf"
  | "StartOfSecondHalf"
  | "EndOfNormalTime"
  | "GoalWithoutScorer"

/**
 * Baseball timeline events. The data feed currently does not emit
 * baseball events; `Match.timeline` for a baseball match is typically `[]`.
 * Kept as a type alias for forward-compat once the feed starts emitting.
 */
export type BaseballTimelineEventType = string

export const Line = z.object({
  id: BetItemId,
  /** Outcome code, e.g. "1", "X", "2", "O2.5", "GG". */
  code: z.string(),
  /** Display label, e.g. "Over 2.5". May be null for code-only items. */
  caption: z.string().nullable(),
  /** Decimal odds (e.g. 2.10). Other formats are not negotiated in v1. */
  price: z.number().positive(),
  isAvailable: z.boolean(),
  /** ISO timestamp of the last odds update. Prelive: per-item DB write time. Live: feed ingestion time. */
  updatedAt: z.string().optional(),
})
export type Line = z.infer<typeof Line>

/** @deprecated Use `Line` instead. */
export const BetItem = Line
/** @deprecated Use `Line` instead. */
export type BetItem = Line

export const Market = z.object({
  id: MarketId,
  /** Market sysname, e.g. "SOCCER_MATCH_RESULT", "SOCCER_UNDER_OVER". */
  betType: z.string(),
  /**
   * Human-readable market name for the requested locale, e.g. "Match
   * Result". Always populated — falls back through English, then a
   * formatted version of `betType` (sport prefix stripped, underscores to
   * spaces, title case) if no translation exists for this sysname yet.
   */
  displayName: z.string(),
  lines: z.array(Line),
  /** @deprecated Use `lines` instead. */
  betItems: z.array(Line).optional(),
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
 * Match shape returned by list/search/trending endpoints. Lean by design —
 * identity + teams + sport/competition/region + stats + clock. Markets live
 * on a separate resource — see `odds.list` / `odds.subscribe` — so a match
 * payload doesn't have to carry an order book every customer renders or
 * pays bandwidth for. For full match detail (with `views`), use
 * `matches.get` or `matches.subscribe`.
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
  /**
   * Sport-tagged live statistics. Discriminated by `stats.sport`. Present
   * on live and completed matches; absent for upcoming matches with no
   * stats yet. Narrow with `match.stats?.sport === "<name>"` to access
   * sport-specific fields. See per-sport variant types (`SoccerStats`,
   * `TennisStats`, …) for the field set per sport.
   */
  stats: MatchStats.nullable().optional(),
  /**
   * Match timeline — sport-tagged event log. Generic envelope (`type`,
   * `side`, `phase`, `captions`, `timeOffsetSeconds`). Per-sport event-type
   * unions (`SoccerTimelineEventType`, `TennisTimelineEventType`, …) are
   * exported as TypeScript aliases for narrowing on `event.type`.
   *
   * Baseball matches return an empty timeline today — the data feed
   * doesn't emit baseball events.
   */
  timeline: z.array(TimelineEvent).optional(),
})
export type Match = z.infer<typeof Match>

/** Convenience alias — typed selector for the `Match` shape. */
export type MatchSelect = Selector<Match>

/**
 * Full match detail returned by `matches.get` and as the initial snapshot of
 * `matches.subscribe`. Stats + clock are populated; markets are on the
 * dedicated `odds.*` resource.
 */
export const MatchDetail = Match.extend({
  views: z.number().int().nonnegative().optional(),
})
export type MatchDetail = z.infer<typeof MatchDetail>

/** Convenience alias — typed selector for the `MatchDetail` shape. */
export type MatchDetailSelect = Selector<MatchDetail>

/** Convenience alias — typed selector for the `Market` shape. */
export type MarketSelect = Selector<Market>

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
// AI: recommendations
// ---------------------------------------------------------------------------

export const PickConfidence = z.enum(["High", "Medium", "Low"])
export type PickConfidence = z.infer<typeof PickConfidence>

export const PickResult = z.enum(["won", "lost", "push"]).nullable()
export type PickResult = z.infer<typeof PickResult>

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
