"use client"

import { useCallback, useSyncExternalStore } from "react"
import type { Match } from "@mrdoge/protocol"
import { getMrDogeClient } from "../client"
import { createResourceStore } from "../store"

export interface UseTrendingMatchesOptions {
  /** Restrict to specific sports, e.g. ["soccer"]. Omit for all sports. */
  sports?: string[]
  /** Restrict to specific match statuses, e.g. ["upcoming"]. Omit for all statuses. */
  status?: ("upcoming" | "live" | "completed")[]
  /** Result count. Server default 5, capped at 50. */
  limit?: number
  /** IANA timezone for any timezone-dependent fields server-side. */
  timezone?: string
  /** Locale for any localized fields server-side. */
  locale?: string
}

const store = createResourceStore<Match[] | null | undefined>()

function start(params: UseTrendingMatchesOptions) {
  return (set: (value: Match[] | null | undefined) => void) => {
    let cancelled = false

    getMrDogeClient()
      .matches.trending(params)
      .then((result) => {
        if (!cancelled) set(result)
      })
      .catch(() => {
        if (!cancelled) set(null)
      })

    return () => {
      cancelled = true
    }
  }
}

function cacheKey(options: UseTrendingMatchesOptions): string {
  const { sports, status, limit, timezone, locale } = options
  return `matches.trending:${sports?.join(",") ?? ""}:${status?.join(",") ?? ""}:${limit ?? ""}:${timezone ?? ""}:${locale ?? ""}`
}

/**
 * Today's most-viewed matches, ranked server-side by views — see
 * `matches.trending`. Fetched once per unique params, shared by every
 * component asking for the same ones — a later mount gets the cached
 * value immediately instead of refetching. Doesn't push live updates.
 *
 * undefined = loading, null = the request failed (no fallback — that's an
 * honest empty state, not a fictional one).
 */
export function useTrendingMatches(options: UseTrendingMatchesOptions = {}): Match[] | null | undefined {
  const key = cacheKey(options)

  // Stable across renders for the same key — see useLiveMatch for why an
  // inline closure here would cause a resubscribe (and lose cached data)
  // on every unrelated re-render. Depends on key (options' stable
  // stringified form), not options itself — a fresh object literal at the
  // call site (the common case, e.g. `useTrendingMatches({ limit: 5 })`)
  // would otherwise defeat the memoization the same way.
  const subscribe = useCallback(
    (listener: () => void) => store.subscribe(key, undefined, start(options), listener),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key is the stable form of options
    [key]
  )
  const getSnapshot = useCallback(() => store.getSnapshot(key, undefined), [key])

  return useSyncExternalStore(subscribe, getSnapshot, () => undefined)
}
