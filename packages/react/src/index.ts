/**
 * @mrdoge/react — React hooks for @mrdoge/client, backed by a shared cache.
 *
 * Every hook here keys its cache by call params — any number of components
 * asking for the same match/odds/list share one underlying subscription or
 * fetch and one copy of the data, instead of each duplicating it. No
 * Provider required: the client and cache are both module-level, the same
 * zero-setup shape as calling `@mrdoge/client` directly.
 *
 * ```tsx
 * import { useLiveMatch } from "@mrdoge/react"
 *
 * function Match({ matchId }: { matchId: string }) {
 *   const match = useLiveMatch({ matchId })
 *   // ...
 * }
 * ```
 */

export { useLiveMatch, type UseLiveMatchOptions } from "./hooks/use-live-match"
export { useMatch, type UseMatchOptions } from "./hooks/use-match"
export { useOdds, type UseOddsOptions } from "./hooks/use-odds"
export { useTrendingMatches, type UseTrendingMatchesOptions } from "./hooks/use-trending-matches"
export { useMatches, type UseMatchesOptions } from "./hooks/use-matches"
export { useRegions, type UseRegionsOptions } from "./hooks/use-regions"
export { useLiveMatches, type UseLiveMatchesOptions } from "./hooks/use-live-matches"
export { useOddsMovement, type OddsMovement } from "./hooks/use-odds-movement"
export { getMrDogeClient, configureMrDoge } from "./client"
