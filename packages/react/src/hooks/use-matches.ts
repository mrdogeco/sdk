"use client"

import { useCallback, useSyncExternalStore } from "react"
import type { Match } from "@mrdoge/protocol"
import { getMrDogeClient } from "../client"
import { createResourceStore } from "../store"

export interface UseMatchesOptions {
  /** Restrict to matches in these regions. */
  regionIds?: number[]
  /** Restrict to specific sports, e.g. ["soccer"]. Omit for all sports. */
  sports?: string[]
  /** Restrict to specific match statuses, e.g. ["upcoming"]. Omit for all statuses. */
  status?: ("upcoming" | "live" | "completed")[]
  /** Single day, YYYY-MM-DD. Mutually exclusive with startDate/endDate. */
  date?: string
  /** Start of a date range, YYYY-MM-DD, inclusive. */
  startDate?: string
  /** End of a date range, YYYY-MM-DD, inclusive. */
  endDate?: string
  /** Result count. Server default 20, capped at 100. */
  limit?: number
  /** IANA timezone for any timezone-dependent fields server-side. */
  timezone?: string
  /** Locale for any localized fields server-side. */
  locale?: string
}

const store = createResourceStore<Match[] | null | undefined>()

function start(params: UseMatchesOptions) {
  return (set: (value: Match[] | null | undefined) => void) => {
    let cancelled = false

    getMrDogeClient()
      .matches.list(params)
      .then((result) => {
        if (!cancelled) set(result.data)
      })
      .catch(() => {
        if (!cancelled) set(null)
      })

    return () => {
      cancelled = true
    }
  }
}

function cacheKey(options: UseMatchesOptions): string {
  const { regionIds, sports, status, date, startDate, endDate, limit, timezone, locale } = options
  return `matches.list:${regionIds?.join(",") ?? ""}:${sports?.join(",") ?? ""}:${status?.join(",") ?? ""}:${date ?? ""}:${startDate ?? ""}:${endDate ?? ""}:${limit ?? ""}:${timezone ?? ""}:${locale ?? ""}`
}

/**
 * A plain list of matches — see `matches.list`. Unlike
 * `useTrendingMatches`, not limited to today's most-viewed ones. Fetched
 * once per unique params, shared by every component asking for the same
 * ones — a later mount gets the cached value immediately instead of
 * refetching. Doesn't push live updates.
 *
 * undefined = loading, null = the request failed (no fallback — that's an
 * honest empty state, not a fictional one).
 */
export function useMatches(options: UseMatchesOptions = {}): Match[] | null | undefined {
  const key = cacheKey(options)

  // Stable across renders for the same key — see useLiveMatch for why an
  // inline closure here would cause a resubscribe (and lose cached data)
  // on every unrelated re-render. Depends on key (options' stable
  // stringified form), not options itself — a fresh object literal at the
  // call site (the common case, e.g. `useMatches({ status: ["upcoming"] })`)
  // would otherwise defeat the memoization the same way.
  const subscribe = useCallback(
    (listener: () => void) => store.subscribe(key, undefined, start(options), listener),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key is the stable form of options
    [key]
  )
  const getSnapshot = useCallback(() => store.getSnapshot(key, undefined), [key])

  return useSyncExternalStore(subscribe, getSnapshot, () => undefined)
}
